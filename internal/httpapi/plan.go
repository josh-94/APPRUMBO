package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"hoy/internal/store"
)

func (s *Server) moneyPlan(w http.ResponseWriter, r *http.Request) {
	userID := currentUser(r)
	if err := s.Store.EnsurePayTasks(r.Context(), userID, s.today(), s.Loc); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer el plan")
		return
	}
	if s.FX != nil {
		if hundredths, err := s.FX.Hundredths(r.Context()); err == nil {
			_ = s.Store.SetFx(r.Context(), userID, hundredths)
		}
	}
	plan, err := s.Store.MoneyPlan(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer el plan")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) setFx(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FxHundredths int `json:"fxHundredths"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := s.Store.SetFx(r.Context(), currentUser(r), body.FxHundredths); err != nil {
		if errors.Is(err, store.ErrBadMoney) {
			writeError(w, http.StatusUnprocessableEntity, "El tipo de cambio no parece correcto.")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo guardar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) setHomeCurrency(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Currency string `json:"currency"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if err := s.Store.SetHomeCurrency(r.Context(), currentUser(r), body.Currency); err != nil {
		if errors.Is(err, store.ErrBadMoney) {
			writeError(w, http.StatusUnprocessableEntity, "Esa moneda no parece correcta.")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo guardar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) saveAccount(w http.ResponseWriter, r *http.Request) {
	var body store.PayAccount
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if r.PathValue("id") != "" {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		body.ID = id
	}
	item, err := s.Store.SaveAccount(r.Context(), currentUser(r), body)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa el nombre, el día y el monto del sueldo.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la cuenta")
		return
	}
	_ = s.Store.EnsurePayTasks(r.Context(), currentUser(r), s.today(), s.Loc)
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	err := s.Store.DeleteAccount(r.Context(), currentUser(r), id)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Esa cuenta ya tiene movimientos.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo borrar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) saveDebt(w http.ResponseWriter, r *http.Request) {
	var body store.Debt
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if r.PathValue("id") != "" {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		body.ID = id
	}
	item, err := s.Store.SaveDebt(r.Context(), currentUser(r), body)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa el nombre, el día y los montos.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la deuda")
		return
	}
	_ = s.Store.EnsurePayTasks(r.Context(), currentUser(r), s.today(), s.Loc)
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteDebt(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteDebt(r.Context(), currentUser(r), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) debtMoves(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	moves, err := s.Store.DebtMoves(r.Context(), currentUser(r), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Solo las tarjetas tienen movimientos.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer")
		return
	}
	writeJSON(w, http.StatusOK, moves)
}

func (s *Server) addDebtMove(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body struct {
		Kind        string `json:"kind"`
		Currency    string `json:"currency"`
		AmountCents int64  `json:"amountCents"`
		Day         string `json:"day"`
		Note        string `json:"note"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	day, ok := s.movementDay(w, body.Day)
	if !ok {
		return
	}
	item, err := s.Store.AddDebtMove(r.Context(), currentUser(r), store.DebtMove{
		DebtID:      id,
		Kind:        body.Kind,
		Currency:    body.Currency,
		AmountCents: body.AmountCents,
		Note:        body.Note,
	}, day)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa el monto y el tipo de movimiento.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo anotar")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteDebtMove(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	moveID, err := strconv.ParseInt(r.PathValue("moveId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Identificador inválido")
		return
	}
	if err := s.Store.DeleteDebtMove(r.Context(), currentUser(r), id, moveID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) saveBill(w http.ResponseWriter, r *http.Request) {
	var body store.Bill
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	if r.PathValue("id") != "" {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		body.ID = id
	}
	item, err := s.Store.SaveBill(r.Context(), currentUser(r), body)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "Revisa el nombre, el día y el monto.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "No está")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar el pago")
		return
	}
	_ = s.Store.EnsurePayTasks(r.Context(), currentUser(r), s.today(), s.Loc)
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteBill(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteBill(r.Context(), currentUser(r), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "No está")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo borrar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) confirmPay(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind        string `json:"kind"`
		ID          int64  `json:"id"`
		AmountCents int64  `json:"amountCents"`
		BalancePen  int64  `json:"balancePen"`
		BalanceUsd  int64  `json:"balanceUsd"`
	}
	if err := readJSON(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido")
		return
	}
	err := s.Store.ConfirmPay(r.Context(), currentUser(r), store.ConfirmPay{
		Kind:        body.Kind,
		ID:          body.ID,
		AmountCents: body.AmountCents,
		BalancePen:  body.BalancePen,
		BalanceUsd:  body.BalanceUsd,
	}, s.today(), s.Loc)
	if errors.Is(err, store.ErrBadMoney) {
		writeError(w, http.StatusUnprocessableEntity, "El monto del pago no parece correcto.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Ese pago ya no está pendiente")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo confirmar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
