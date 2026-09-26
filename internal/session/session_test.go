package session

import (
	"testing"
	"time"
)

func TestPasswordOK(t *testing.T) {
	if !PasswordOK("correct horse", "correct horse") {
		t.Fatal("expected match")
	}
	if PasswordOK("nope", "correct horse") {
		t.Fatal("expected mismatch")
	}
	if PasswordOK("correct horse", "") {
		t.Fatal("empty want is never ok")
	}
}

func TestSessionExpiry(t *testing.T) {
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)
	token := Sign("secret-secret-secret", now.Add(time.Hour))
	if !Valid("secret-secret-secret", token, now) {
		t.Fatal("fresh token should be valid")
	}
	if Valid("secret-secret-secret", token, now.Add(2*time.Hour)) {
		t.Fatal("expired token should fail")
	}
	if Valid("other-secret-other", token, now) {
		t.Fatal("wrong secret should fail")
	}
	if Valid("secret-secret-secret", "1.abcd", now) {
		t.Fatal("short signature should fail")
	}
}
