package fx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseHundredthsSkipsND(t *testing.T) {
	got, err := ParseHundredths([]byte(`{"periods":[
		{"values":["3.400"]},
		{"values":["n.d."]},
		{"values":["3.428"]}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	if got != 343 {
		t.Fatalf("got %d want 343", got)
	}
}

func TestClientCaches(t *testing.T) {
	hits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		_, _ = w.Write([]byte(`{"periods":[{"values":["3.40"]}]}`))
	}))
	defer server.Close()

	client := &Client{HTTP: server.Client(), URL: server.URL}
	first, err := client.Hundredths(context.Background())
	if err != nil || first != 340 {
		t.Fatalf("%d %v", first, err)
	}
	second, err := client.Hundredths(context.Background())
	if err != nil || second != 340 {
		t.Fatalf("%d %v", second, err)
	}
	if hits != 1 {
		t.Fatalf("hits %d want 1", hits)
	}
}
