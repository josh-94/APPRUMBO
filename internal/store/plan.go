package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"hoy/internal/schedule"
)

const DefaultFxHundredths = 340

type PayAccount struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Payday      int    `json:"payday"`
	PaydayCents int64  `json:"paydayCents"`
}

type Debt struct {
	ID         int64  `json:"id"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	BalancePen int64  `json:"balancePen"`
	BalanceUsd int64  `json:"balanceUsd"`
	CuotaPen   int64  `json:"cuotaPen"`
	CuotaUsd   int64  `json:"cuotaUsd"`
	DueDay     int    `json:"dueDay"`
	Currency   string `json:"currency"`
}

type Bill struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	AmountCents int64  `json:"amountCents"`
	DueDay      int    `json:"dueDay"`
	CategoryID  int64  `json:"categoryId"`
	Category    string `json:"category"`
}

type MoneyPlan struct {
	FxHundredths  int          `json:"fxHundredths"`
	Accounts      []PayAccount `json:"accounts"`
	Debts         []Debt       `json:"debts"`
	Bills         []Bill       `json:"bills"`
	DebtPen       int64        `json:"debtPen"`
	DebtUsd       int64        `json:"debtUsd"`
	DebtTotalPen  int64        `json:"debtTotalPen"`
	CuotaTotalPen int64        `json:"cuotaTotalPen"`
}

type ConfirmPay struct {
	Kind        string
	ID          int64
	AmountCents int64
	BalancePen  int64
	BalanceUsd  int64
}

func PenFromUsd(cents int64, fxHundredths int) int64 {
	if cents <= 0 || fxHundredths <= 0 {
		return 0
	}
	return cents * int64(fxHundredths) / 100
}

// NextPayDate elige la fecha del banco que toca avisar.
// La segunda vuelta es false cuando esa fecha está a más de 7 días.
func NextPayDate(day int, today time.Time, last *time.Time, loc *time.Location) (time.Time, bool) {
	today = schedule.StartOfDay(today, loc)
	thisMonth := payClock(today.Year(), today.Month(), day, loc)
	if confirmedThrough(last, thisMonth, loc) {
		next := payClock(today.Year(), today.Month()+1, day, loc)
		return next, showPay(today, next, loc)
	}
	if schedule.StartOfDay(thisMonth, loc).Before(today) {
		return thisMonth, true
	}
	return thisMonth, showPay(today, thisMonth, loc)
}

func (s *Store) MoneyPlan(ctx context.Context, userID int64) (MoneyPlan, error) {
	plan := MoneyPlan{FxHundredths: DefaultFxHundredths, Accounts: []PayAccount{}, Debts: []Debt{}, Bills: []Bill{}}
	err := s.pool.QueryRow(ctx, `SELECT fx_hundredths FROM money_settings WHERE user_id = $1`, userID).Scan(&plan.FxHundredths)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return MoneyPlan{}, err
	}
	accounts, err := s.payAccounts(ctx, userID)
	if err != nil {
		return MoneyPlan{}, err
	}
	debts, err := s.debts(ctx, userID)
	if err != nil {
		return MoneyPlan{}, err
	}
	bills, err := s.bills(ctx, userID)
	if err != nil {
		return MoneyPlan{}, err
	}
	plan.Accounts = accounts
	plan.Debts = debts
	plan.Bills = bills
	for _, debt := range debts {
		plan.DebtPen += debt.BalancePen
		plan.DebtUsd += debt.BalanceUsd
		plan.CuotaTotalPen += debt.CuotaPen + PenFromUsd(debt.CuotaUsd, plan.FxHundredths)
	}
	plan.DebtTotalPen = plan.DebtPen + PenFromUsd(plan.DebtUsd, plan.FxHundredths)
	return plan, nil
}

func (s *Store) SetFx(ctx context.Context, userID int64, hundredths int) error {
	if hundredths < 100 || hundredths > 2000 {
		return ErrBadMoney
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO money_settings (user_id, fx_hundredths) VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET fx_hundredths = EXCLUDED.fx_hundredths`, userID, hundredths)
	return err
}

func (s *Store) SaveAccount(ctx context.Context, userID int64, item PayAccount) (PayAccount, error) {
	name, err := cleanLabel(item.Name, 80)
	if err != nil || name == "" || item.Payday < 0 || item.Payday > 31 || item.PaydayCents < 0 {
		return PayAccount{}, ErrBadMoney
	}
	if (item.Payday == 0) != (item.PaydayCents == 0) {
		return PayAccount{}, ErrBadMoney
	}
	item.Name = name
	if item.ID == 0 {
		err = s.pool.QueryRow(ctx, `
			INSERT INTO accounts (user_id, name, payday, payday_cents)
			VALUES ($1, $2, NULLIF($3, 0), NULLIF($4, 0))
			RETURNING id`, userID, item.Name, item.Payday, item.PaydayCents).Scan(&item.ID)
		return item, err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE accounts SET name = $3, payday = NULLIF($4, 0), payday_cents = NULLIF($5, 0)
		WHERE id = $1 AND user_id = $2`, item.ID, userID, item.Name, item.Payday, item.PaydayCents)
	if err != nil {
		return PayAccount{}, err
	}
	if tag.RowsAffected() == 0 {
		return PayAccount{}, ErrNotFound
	}
	return item, nil
}

func (s *Store) DeleteAccount(ctx context.Context, userID, id int64) error {
	var moves int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM movements WHERE account_id = $1 AND user_id = $2`, id, userID).Scan(&moves); err != nil {
		return err
	}
	if moves > 0 {
		return ErrBadMoney
	}
	if err := s.closePayTask(ctx, userID, "sueldo", id); err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `DELETE FROM accounts WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) SaveDebt(ctx context.Context, userID int64, item Debt) (Debt, error) {
	name, err := cleanLabel(item.Name, 80)
	if err != nil || name == "" || (item.Kind != "tarjeta" && item.Kind != "prestamo") {
		return Debt{}, ErrBadMoney
	}
	if item.DueDay < 1 || item.DueDay > 31 || item.BalancePen < 0 || item.BalanceUsd < 0 || item.CuotaPen < 0 || item.CuotaUsd < 0 {
		return Debt{}, ErrBadMoney
	}
	if item.Kind == "prestamo" {
		if item.Currency != "pen" && item.Currency != "usd" {
			return Debt{}, ErrBadMoney
		}
		if item.Currency == "pen" {
			item.BalanceUsd, item.CuotaUsd = 0, 0
		} else {
			item.BalancePen, item.CuotaPen = 0, 0
		}
	} else {
		item.Currency = "pen"
	}
	item.Name = name
	if item.ID == 0 {
		err = s.pool.QueryRow(ctx, `
			INSERT INTO debts (user_id, kind, name, balance_pen, balance_usd, cuota_pen, cuota_usd, due_day, currency)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id`,
			userID, item.Kind, item.Name, item.BalancePen, item.BalanceUsd, item.CuotaPen, item.CuotaUsd, item.DueDay, item.Currency).Scan(&item.ID)
		return item, err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE debts SET kind = $3, name = $4, balance_pen = $5, balance_usd = $6,
			cuota_pen = $7, cuota_usd = $8, due_day = $9, currency = $10
		WHERE id = $1 AND user_id = $2`,
		item.ID, userID, item.Kind, item.Name, item.BalancePen, item.BalanceUsd, item.CuotaPen, item.CuotaUsd, item.DueDay, item.Currency)
	if err != nil {
		return Debt{}, err
	}
	if tag.RowsAffected() == 0 {
		return Debt{}, ErrNotFound
	}
	return item, nil
}

func (s *Store) DeleteDebt(ctx context.Context, userID, id int64) error {
	var kind string
	err := s.pool.QueryRow(ctx, `SELECT kind FROM debts WHERE id = $1 AND user_id = $2`, id, userID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if err := s.closePayTask(ctx, userID, kind, id); err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM debts WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (s *Store) SaveBill(ctx context.Context, userID int64, item Bill) (Bill, error) {
	name, err := cleanLabel(item.Name, 80)
	if err != nil || name == "" || item.DueDay < 1 || item.DueDay > 31 || item.AmountCents <= 0 {
		return Bill{}, ErrBadMoney
	}
	if item.CategoryID != 0 {
		var owner int64
		var kind string
		if err := s.pool.QueryRow(ctx, `SELECT user_id, kind FROM categories WHERE id = $1`, item.CategoryID).Scan(&owner, &kind); err != nil || owner != userID || kind != "gasto" {
			return Bill{}, ErrBadMoney
		}
	}
	item.Name = name
	if item.ID == 0 {
		err = s.pool.QueryRow(ctx, `
			INSERT INTO bills (user_id, name, amount_cents, due_day, category_id)
			VALUES ($1, $2, $3, $4, NULLIF($5, 0))
			RETURNING id`, userID, item.Name, item.AmountCents, item.DueDay, item.CategoryID).Scan(&item.ID)
		return item, err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE bills SET name = $3, amount_cents = $4, due_day = $5, category_id = NULLIF($6, 0)
		WHERE id = $1 AND user_id = $2`, item.ID, userID, item.Name, item.AmountCents, item.DueDay, item.CategoryID)
	if err != nil {
		return Bill{}, err
	}
	if tag.RowsAffected() == 0 {
		return Bill{}, ErrNotFound
	}
	return item, nil
}

func (s *Store) DeleteBill(ctx context.Context, userID, id int64) error {
	if err := s.closePayTask(ctx, userID, "mes", id); err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `DELETE FROM bills WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) EnsurePayTasks(ctx context.Context, userID int64, today time.Time, loc *time.Location) error {
	var listID int64
	err := s.pool.QueryRow(ctx, `SELECT id FROM lists WHERE user_id = $1 ORDER BY position, id LIMIT 1`, userID).Scan(&listID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	accounts, err := s.payAccounts(ctx, userID)
	if err != nil {
		return err
	}
	for _, account := range accounts {
		if account.Payday == 0 || account.PaydayCents == 0 {
			continue
		}
		last, err := s.lastPaid(ctx, `SELECT last_payday FROM accounts WHERE id = $1 AND user_id = $2`, account.ID, userID)
		if err != nil {
			return err
		}
		due, show := NextPayDate(account.Payday, today, last, loc)
		if !show {
			continue
		}
		note := bankNote(due, loc)
		if err := s.openPayTask(ctx, userID, listID, "sueldo", account.ID, "Llega el sueldo en "+account.Name, note, due); err != nil {
			return err
		}
	}
	debts, err := s.debts(ctx, userID)
	if err != nil {
		return err
	}
	for _, debt := range debts {
		last, err := s.lastPaid(ctx, `SELECT last_paid FROM debts WHERE id = $1 AND user_id = $2`, debt.ID, userID)
		if err != nil {
			return err
		}
		due, show := NextPayDate(debt.DueDay, today, last, loc)
		if !show {
			continue
		}
		title := "Pagar " + debt.Name
		if debt.Kind == "prestamo" {
			title = "Cuota " + debt.Name
		}
		note := bankNote(due, loc)
		if err := s.openPayTask(ctx, userID, listID, debt.Kind, debt.ID, title, note, due); err != nil {
			return err
		}
	}
	bills, err := s.bills(ctx, userID)
	if err != nil {
		return err
	}
	for _, bill := range bills {
		last, err := s.lastPaid(ctx, `SELECT last_paid FROM bills WHERE id = $1 AND user_id = $2`, bill.ID, userID)
		if err != nil {
			return err
		}
		due, show := NextPayDate(bill.DueDay, today, last, loc)
		if !show {
			continue
		}
		note := "Se repite el día " + due.In(loc).Format("2") + ". No es deuda."
		if err := s.openPayTask(ctx, userID, listID, "mes", bill.ID, "Pagar "+bill.Name, note, due); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ConfirmPay(ctx context.Context, userID int64, in ConfirmPay, day time.Time, loc *time.Location) error {
	if in.AmountCents <= 0 {
		return ErrBadMoney
	}
	switch in.Kind {
	case "sueldo", "tarjeta", "prestamo", "mes":
	default:
		return ErrBadMoney
	}
	if in.BalancePen < 0 || in.BalanceUsd < 0 {
		return ErrBadMoney
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var due time.Time
	err = tx.QueryRow(ctx, `
		SELECT due_at FROM tasks
		WHERE pay_kind = $1 AND pay_ref = $2 AND status = 'open'
		  AND list_id IN (SELECT id FROM lists WHERE user_id = $3)
		ORDER BY due_at LIMIT 1`, in.Kind, in.ID, userID).Scan(&due)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	var accountID int64
	var categoryID int64
	var kind string
	var note string
	switch in.Kind {
	case "sueldo":
		var payday int
		err = tx.QueryRow(ctx, `SELECT name, COALESCE(payday, 0) FROM accounts WHERE id = $1 AND user_id = $2`, in.ID, userID).Scan(&note, &payday)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		accountID = in.ID
		kind = "ingreso"
		note = "Sueldo " + note
		_ = payday
	case "mes":
		var name string
		var dueDay int
		err = tx.QueryRow(ctx, `SELECT name, due_day, COALESCE(category_id, 0) FROM bills WHERE id = $1 AND user_id = $2`, in.ID, userID).Scan(&name, &dueDay, &categoryID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		accountID, err = s.defaultAccount(ctx, tx, userID)
		if err != nil {
			return err
		}
		kind = "gasto"
		note = name
		_ = dueDay
		if _, err = tx.Exec(ctx, `UPDATE bills SET last_paid = $3 WHERE id = $1 AND user_id = $2`, in.ID, userID, civilDate(due, loc)); err != nil {
			return err
		}
	case "tarjeta", "prestamo":
		var debt Debt
		var dueDay int
		err = tx.QueryRow(ctx, `
			SELECT kind, name, due_day, currency FROM debts WHERE id = $1 AND user_id = $2`, in.ID, userID).Scan(&debt.Kind, &debt.Name, &dueDay, &debt.Currency)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil || debt.Kind != in.Kind {
			if err == nil {
				return ErrBadMoney
			}
			return err
		}
		accountID, err = s.defaultAccount(ctx, tx, userID)
		if err != nil {
			return err
		}
		categoryID, err = gastoCategory(ctx, tx, userID)
		if err != nil {
			return err
		}
		kind = "gasto"
		note = "Cuota " + debt.Name
		_ = dueDay
		balancePen, balanceUsd := in.BalancePen, in.BalanceUsd
		if in.Kind == "prestamo" && debt.Currency == "usd" {
			balancePen = 0
		}
		if in.Kind == "prestamo" && debt.Currency == "pen" {
			balanceUsd = 0
		}
		if _, err = tx.Exec(ctx, `
			UPDATE debts SET balance_pen = $3, balance_usd = $4, last_paid = $5
			WHERE id = $1 AND user_id = $2`, in.ID, userID, balancePen, balanceUsd, civilDate(due, loc)); err != nil {
			return err
		}
	}
	if in.Kind == "sueldo" {
		if _, err = tx.Exec(ctx, `UPDATE accounts SET last_payday = $3 WHERE id = $1 AND user_id = $2`, in.ID, userID, civilDate(due, loc)); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO movements (user_id, account_id, category_id, kind, amount_cents, occurred_on, note)
		VALUES ($1, $2, NULLIF($3, 0), $4, $5, $6, $7)`,
		userID, accountID, categoryID, kind, in.AmountCents, civilDate(day, loc), note); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE tasks SET status = 'done', pinned = FALSE, completed_at = now(), updated_at = now()
		WHERE pay_kind = $1 AND pay_ref = $2 AND status = 'open'
		  AND list_id IN (SELECT id FROM lists WHERE user_id = $3)`, in.Kind, in.ID, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) payAccounts(ctx context.Context, userID int64) ([]PayAccount, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, COALESCE(payday, 0), COALESCE(payday_cents, 0)
		FROM accounts WHERE user_id = $1 ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PayAccount
	for rows.Next() {
		var item PayAccount
		if err := rows.Scan(&item.ID, &item.Name, &item.Payday, &item.PaydayCents); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []PayAccount{}
	}
	return out, rows.Err()
}

func (s *Store) debts(ctx context.Context, userID int64) ([]Debt, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, kind, name, balance_pen, balance_usd, cuota_pen, cuota_usd, due_day, currency
		FROM debts WHERE user_id = $1 ORDER BY due_day, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Debt
	for rows.Next() {
		var item Debt
		if err := rows.Scan(&item.ID, &item.Kind, &item.Name, &item.BalancePen, &item.BalanceUsd, &item.CuotaPen, &item.CuotaUsd, &item.DueDay, &item.Currency); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Debt{}
	}
	return out, rows.Err()
}

func (s *Store) bills(ctx context.Context, userID int64) ([]Bill, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT b.id, b.name, b.amount_cents, b.due_day, COALESCE(b.category_id, 0), COALESCE(c.name, '')
		FROM bills b
		LEFT JOIN categories c ON c.id = b.category_id
		WHERE b.user_id = $1 ORDER BY b.due_day, b.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Bill
	for rows.Next() {
		var item Bill
		if err := rows.Scan(&item.ID, &item.Name, &item.AmountCents, &item.DueDay, &item.CategoryID, &item.Category); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Bill{}
	}
	return out, rows.Err()
}

func (s *Store) lastPaid(ctx context.Context, query string, id, userID int64) (*time.Time, error) {
	var last *time.Time
	err := s.pool.QueryRow(ctx, query, id, userID).Scan(&last)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return last, err
}

func (s *Store) openPayTask(ctx context.Context, userID, listID int64, kind string, ref int64, title, note string, due time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO tasks (list_id, title, notes, due_at, pinned, position, pay_kind, pay_ref)
		SELECT $1, $2, $3, $4, TRUE,
		       COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE list_id = $1), 0),
		       $5, $6
		WHERE NOT EXISTS (
			SELECT 1 FROM tasks t
			JOIN lists l ON l.id = t.list_id
			WHERE l.user_id = $7 AND t.pay_kind = $5 AND t.pay_ref = $6 AND t.status = 'open'
		)`, listID, title, note, due, kind, ref, userID)
	return err
}

func (s *Store) closePayTask(ctx context.Context, userID int64, kind string, ref int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tasks SET status = 'done', pinned = FALSE, completed_at = now(), updated_at = now()
		WHERE pay_kind = $1 AND pay_ref = $2 AND status = 'open'
		  AND list_id IN (SELECT id FROM lists WHERE user_id = $3)`, kind, ref, userID)
	return err
}

func (s *Store) defaultAccount(ctx context.Context, tx pgx.Tx, userID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `SELECT id FROM accounts WHERE user_id = $1 ORDER BY id LIMIT 1`, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return id, err
}

func gastoCategory(ctx context.Context, tx pgx.Tx, userID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		SELECT id FROM categories
		WHERE user_id = $1 AND kind = 'gasto' AND lower(name) = 'otros'
		ORDER BY id LIMIT 1`, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	return id, err
}

func confirmedThrough(last *time.Time, due time.Time, loc *time.Location) bool {
	if last == nil {
		return false
	}
	return last.UTC().Format("2006-01-02") >= due.In(loc).Format("2006-01-02")
}

func showPay(today, due time.Time, loc *time.Location) bool {
	dueDay := schedule.StartOfDay(due, loc)
	return !dueDay.After(today.AddDate(0, 0, 7))
}

func payClock(year int, month time.Month, day int, loc *time.Location) time.Time {
	if day < 1 {
		day = 1
	}
	last := time.Date(year, month+1, 0, 9, 0, 0, 0, loc).Day()
	if day > last {
		day = last
	}
	return time.Date(year, month, day, 9, 0, 0, 0, loc)
}

func bankNote(due time.Time, loc *time.Location) string {
	return "Fecha del banco: día " + due.In(loc).Format("2") + ". Si mueves la tarea, esa fecha no cambia."
}

func civilDate(t time.Time, loc *time.Location) time.Time {
	year, month, day := t.In(loc).Date()
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}
