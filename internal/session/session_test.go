package session

import (
	"testing"
	"time"
)

func TestSessionCarriesUser(t *testing.T) {
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)
	secret := "secret-secret-secret"
	token := Sign(secret, 42, now.Add(time.Hour))
	id, ok := UserID(secret, token, now)
	if !ok || id != 42 {
		t.Fatalf("id %d ok %v", id, ok)
	}
	if _, ok := UserID(secret, token, now.Add(2*time.Hour)); ok {
		t.Fatal("expired token should fail")
	}
	if _, ok := UserID("other-secret-other", token, now); ok {
		t.Fatal("wrong secret should fail")
	}
	if _, ok := UserID(secret, "1.abcd", now); ok {
		t.Fatal("short signature should fail")
	}
}

func TestOAuthState(t *testing.T) {
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)
	secret := "secret-secret-secret"
	token := SignOAuth(secret, "state-1", "verifier-1", now.Add(10*time.Minute))
	state, verifier, ok := ReadOAuth(secret, token, now)
	if !ok || state != "state-1" || verifier != "verifier-1" {
		t.Fatalf("state %s verifier %s ok %v", state, verifier, ok)
	}
	if _, _, ok := ReadOAuth(secret, token, now.Add(time.Hour)); ok {
		t.Fatal("expired oauth cookie should fail")
	}
}
