package notify

import "testing"

func TestVapidContact(t *testing.T) {
	if got := vapidContact("mailto:hello@codewithjosh.codes"); got != "hello@codewithjosh.codes" {
		t.Fatalf("mailto prefix: %s", got)
	}
	if got := vapidContact("https://codewithjosh.codes"); got != "https://codewithjosh.codes" {
		t.Fatalf("https contact: %s", got)
	}
}
