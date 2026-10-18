package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"hoy/internal/schedule"
)

const DefaultFxHundredths = 340

type PayAccount struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	PayEvery     string `json:"payEvery"`
	Payday       int    `json:"payday"`
	PaydayCents  int64  `json:"paydayCents"`
	Payday2      int    `json:"payday2"`
	Payday2Cents int64  `json:"payday2Cents"`
	Currency     string `json:"currency"`
	BalanceCents int64  `json:"balanceCents"`
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
	Last4      string `json:"last4"`
	LimitCents int64  `json:"limitCents"`
	Tint       string `json:"tint"`
}

type DebtMove struct {
	ID          int64  `json:"id"`
	DebtID      int64  `json:"debtId"`
	Kind        string `json:"kind"`
	Currency    string `json:"currency"`
	AmountCents int64  `json:"amountCents"`
	OccurredOn  string `json:"occurredOn"`
	Note        string `json:"note"`
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
	if err != nil || name == "" {
		return PayAccount{}, ErrBadMoney
	}
	if item.PayEvery == "" && item.Payday > 0 && item.PaydayCents > 0 {
		item.PayEvery = "mes"
	}
	if err = normalizePay(&item); err != nil {
		return PayAccount{}, err
	}
	item.Name = name
	item.Currency, err = cleanCurrency(item.Currency)
	if err != nil {
		return PayAccount{}, err
	}
	if item.ID == 0 {
		err = s.pool.QueryRow(ctx, `
			INSERT INTO accounts (user_id, name, pay_every, payday, payday_cents, payday2, payday2_cents, currency)
			VALUES ($1, $2, $3, NULLIF($4, 0), NULLIF($5, 0), NULLIF($6, 0), NULLIF($7, 0), $8)
			RETURNING id`, userID, item.Name, item.PayEvery, item.Payday, item.PaydayCents, item.Payday2, item.Payday2Cents, item.Currency).Scan(&item.ID)
		return item, err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE accounts SET name = $3, pay_every = $4, payday = NULLIF($5, 0), payday_cents = NULLIF($6, 0),
			payday2 = NULLIF($7, 0), payday2_cents = NULLIF($8, 0), currency = $9
		WHERE id = $1 AND user_id = $2`, item.ID, userID, item.Name, item.PayEvery, item.Payday, item.PaydayCents, item.Payday2, item.Payday2Cents, item.Currency)
	if err != nil {
		return PayAccount{}, err
	}
	if tag.RowsAffected() == 0 {
		return PayAccount{}, ErrNotFound
	}
	return item, nil
}

func cleanCurrency(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "PEN", nil
	}
	if strings.Contains(value, " ") || len([]rune(value)) > 6 {
		return "", ErrBadMoney
	}
	return value, nil
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
	item.Last4 = strings.TrimSpace(item.Last4)
	if item.Kind != "tarjeta" {
		item.Last4 = ""
		item.LimitCents = 0
		item.Tint = "noche"
	} else {
		item.Tint = cleanCardTint(item.Tint)
	}
	if item.LimitCents < 0 || (item.Last4 != "" && !fourDigits(item.Last4)) {
		return Debt{}, ErrBadMoney
	}
	if item.ID == 0 {
		err = s.pool.QueryRow(ctx, `
			INSERT INTO debts (user_id, kind, name, balance_pen, balance_usd, cuota_pen, cuota_usd, due_day, currency, last4, limit_cents, tint)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			RETURNING id`,
			userID, item.Kind, item.Name, item.BalancePen, item.BalanceUsd, item.CuotaPen, item.CuotaUsd, item.DueDay, item.Currency, item.Last4, item.LimitCents, item.Tint).Scan(&item.ID)
		return item, err
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE debts SET kind = $3, name = $4, balance_pen = $5, balance_usd = $6,
			cuota_pen = $7, cuota_usd = $8, due_day = $9, currency = $10, last4 = $11, limit_cents = $12, tint = $13
		WHERE id = $1 AND user_id = $2`,
		item.ID, userID, item.Kind, item.Name, item.BalancePen, item.BalanceUsd, item.CuotaPen, item.CuotaUsd, item.DueDay, item.Currency, item.Last4, item.LimitCents, item.Tint)
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

func fourDigits(value string) bool {
	if len(value) != 4 {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func cleanCardTint(value string) string {
	switch strings.TrimSpace(value) {
	case "oro", "azul", "ciruela", "bosque", "grafito", "cobre":
		return value
	default:
		return "noche"
	}
}

func (s *Store) DebtMoves(ctx context.Context, userID, debtID int64) ([]DebtMove, error) {
	var owner int64
	var kind string
	err := s.pool.QueryRow(ctx, `SELECT user_id, kind FROM debts WHERE id = $1`, debtID).Scan(&owner, &kind)
	if errors.Is(err, pgx.ErrNoRows) || owner != userID {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if kind != "tarjeta" {
		return nil, ErrBadMoney
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, debt_id, kind, currency, amount_cents, to_char(occurred_on, 'YYYY-MM-DD'), note
		FROM debt_moves WHERE debt_id = $1 AND user_id = $2
		ORDER BY occurred_on DESC, id DESC`, debtID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DebtMove{}
	for rows.Next() {
		var item DebtMove
		if err := rows.Scan(&item.ID, &item.DebtID, &item.Kind, &item.Currency, &item.AmountCents, &item.OccurredOn, &item.Note); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) AddDebtMove(ctx context.Context, userID int64, item DebtMove, day time.Time) (DebtMove, error) {
	if item.AmountCents <= 0 || (item.Kind != "consumo" && item.Kind != "pago") || (item.Currency != "pen" && item.Currency != "usd") {
		return DebtMove{}, ErrBadMoney
	}
	note, err := cleanLabel(item.Note, 80)
	if err != nil {
		return DebtMove{}, err
	}
	item.Note = note
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DebtMove{}, err
	}
	defer tx.Rollback(ctx)
	var kind string
	err = tx.QueryRow(ctx, `SELECT kind FROM debts WHERE id = $1 AND user_id = $2 FOR UPDATE`, item.DebtID, userID).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) || kind != "tarjeta" {
		if err == nil || errors.Is(err, pgx.ErrNoRows) {
			return DebtMove{}, ErrNotFound
		}
		return DebtMove{}, err
	}
	if err != nil {
		return DebtMove{}, err
	}
	delta := item.AmountCents
	if item.Kind == "pago" {
		delta = -delta
	}
	if _, err = tx.Exec(ctx, `
		UPDATE debts SET
			balance_pen = CASE WHEN $4 = 'pen' THEN GREATEST(0, balance_pen + $3) ELSE balance_pen END,
			balance_usd = CASE WHEN $4 = 'usd' THEN GREATEST(0, balance_usd + $3) ELSE balance_usd END
		WHERE id = $1 AND user_id = $2`, item.DebtID, userID, delta, item.Currency); err != nil {
		return DebtMove{}, err
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO debt_moves (user_id, debt_id, kind, currency, amount_cents, occurred_on, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`, userID, item.DebtID, item.Kind, item.Currency, item.AmountCents, day, item.Note).Scan(&item.ID)
	if err != nil {
		return DebtMove{}, err
	}
	item.OccurredOn = day.Format("2006-01-02")
	if err = tx.Commit(ctx); err != nil {
		return DebtMove{}, err
	}
	return item, nil
}

func (s *Store) DeleteDebtMove(ctx context.Context, userID, debtID, moveID int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var kind, currency string
	var amount int64
	err = tx.QueryRow(ctx, `
		SELECT kind, currency, amount_cents FROM debt_moves
		WHERE id = $1 AND debt_id = $2 AND user_id = $3`, moveID, debtID, userID).Scan(&kind, &currency, &amount)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	delta := -amount
	if kind == "pago" {
		delta = amount
	}
	if _, err = tx.Exec(ctx, `
		UPDATE debts SET
			balance_pen = CASE WHEN $4 = 'pen' THEN GREATEST(0, balance_pen + $3) ELSE balance_pen END,
			balance_usd = CASE WHEN $4 = 'usd' THEN GREATEST(0, balance_usd + $3) ELSE balance_usd END
		WHERE id = $1 AND user_id = $2`, debtID, userID, delta, currency); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM debt_moves WHERE id = $1 AND user_id = $2`, moveID, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
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
		if account.PayEvery == "" || account.Payday == 0 || account.PaydayCents == 0 {
			continue
		}
		if account.PayEvery == "quincena" && (account.Payday2 == 0 || account.Payday2Cents == 0) {
			continue
		}
		last, err := s.lastPaid(ctx, `SELECT last_payday FROM accounts WHERE id = $1 AND user_id = $2`, account.ID, userID)
		if err != nil {
			return err
		}
		due, show := NextSalaryDate(account.PayEvery, account.Payday, account.Payday2, today, last, loc)
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
		SELECT a.id, a.name, COALESCE(a.pay_every, ''), COALESCE(a.payday, 0), COALESCE(a.payday_cents, 0),
		       COALESCE(a.payday2, 0), COALESCE(a.payday2_cents, 0), a.currency,
		       COALESCE(SUM(CASE WHEN m.kind = 'ingreso' THEN m.amount_cents ELSE -m.amount_cents END), 0)
		FROM accounts a
		LEFT JOIN movements m ON m.account_id = a.id AND m.user_id = a.user_id
		WHERE a.user_id = $1
		GROUP BY a.id
		ORDER BY a.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PayAccount
	for rows.Next() {
		var item PayAccount
		if err := rows.Scan(&item.ID, &item.Name, &item.PayEvery, &item.Payday, &item.PaydayCents, &item.Payday2, &item.Payday2Cents, &item.Currency, &item.BalanceCents); err != nil {
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
		SELECT id, kind, name, balance_pen, balance_usd, cuota_pen, cuota_usd, due_day, currency, last4, limit_cents, tint
		FROM debts WHERE user_id = $1 ORDER BY due_day, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Debt
	for rows.Next() {
		var item Debt
		if err := rows.Scan(&item.ID, &item.Kind, &item.Name, &item.BalancePen, &item.BalanceUsd, &item.CuotaPen, &item.CuotaUsd, &item.DueDay, &item.Currency, &item.Last4, &item.LimitCents, &item.Tint); err != nil {
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

func normalizePay(item *PayAccount) error {
	switch item.PayEvery {
	case "":
		item.Payday, item.PaydayCents, item.Payday2, item.Payday2Cents = 0, 0, 0, 0
		return nil
	case "semana":
		if item.Payday < 1 || item.Payday > 7 || item.PaydayCents <= 0 {
			return ErrBadMoney
		}
		item.Payday2, item.Payday2Cents = 0, 0
	case "mes":
		if item.Payday < 1 || item.Payday > 31 || item.PaydayCents <= 0 {
			return ErrBadMoney
		}
		item.Payday2, item.Payday2Cents = 0, 0
	case "quincena":
		if item.Payday < 1 || item.Payday > 31 || item.Payday2 < 1 || item.Payday2 > 31 || item.Payday == item.Payday2 {
			return ErrBadMoney
		}
		if item.PaydayCents <= 0 || item.Payday2Cents <= 0 {
			return ErrBadMoney
		}
	default:
		return ErrBadMoney
	}
	return nil
}

// NextSalaryDate elige el próximo sueldo según cada semana, cada quincena o cada mes.
func NextSalaryDate(every string, day, day2 int, today time.Time, last *time.Time, loc *time.Location) (time.Time, bool) {
	switch every {
	case "semana":
		return nextWeekPay(day, today, last, loc)
	case "quincena":
		return nextQuincena(day, day2, today, last, loc)
	default:
		return NextPayDate(day, today, last, loc)
	}
}

func nextWeekPay(weekday int, today time.Time, last *time.Time, loc *time.Location) (time.Time, bool) {
	today = schedule.StartOfDay(today, loc)
	if weekday < 1 {
		weekday = 1
	}
	if weekday > 7 {
		weekday = 7
	}
	target := time.Weekday(weekday % 7)
	delta := int(target) - int(today.Weekday())
	due := time.Date(today.Year(), today.Month(), today.Day(), 9, 0, 0, 0, loc).AddDate(0, 0, delta)
	if confirmedThrough(last, due, loc) {
		due = due.AddDate(0, 0, 7)
	}
	return due, showPay(today, due, loc)
}

func nextQuincena(day, day2 int, today time.Time, last *time.Time, loc *time.Location) (time.Time, bool) {
	first, showFirst := NextPayDate(day, today, last, loc)
	second, showSecond := NextPayDate(day2, today, last, loc)
	if showFirst && (!showSecond || first.Before(second)) {
		return first, true
	}
	if showSecond {
		return second, true
	}
	if first.Before(second) {
		return first, false
	}
	return second, false
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
