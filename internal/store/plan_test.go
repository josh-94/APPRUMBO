package store

import (
	"testing"
	"time"
)

func TestPenFromUsdMatchesSheet(t *testing.T) {
	pen := int64(294870)
	usd := int64(41196)
	total := pen + PenFromUsd(usd, 340)
	if total != 434936 {
		t.Fatalf("total = %d, want 434936 (S/ 4349.36)", total)
	}
}

func TestNextPayDate(t *testing.T) {
	loc := time.FixedZone("Lima", -5*60*60)
	day := func(y int, m time.Month, d int) time.Time {
		return time.Date(y, m, d, 15, 0, 0, 0, loc)
	}
	paid := func(y int, m time.Month, d int) *time.Time {
		value := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
		return &value
	}

	due, show := NextPayDate(19, day(2026, time.October, 10), nil, loc)
	if show || due.Day() != 19 || due.Month() != time.October {
		t.Fatalf("10 oct: got %s show=%v", due, show)
	}

	due, show = NextPayDate(19, day(2026, time.October, 12), nil, loc)
	if !show || due.Day() != 19 {
		t.Fatalf("12 oct: got %s show=%v", due, show)
	}

	due, show = NextPayDate(19, day(2026, time.October, 20), nil, loc)
	if !show || due.Month() != time.October || due.Day() != 19 {
		t.Fatalf("overdue: got %s show=%v", due, show)
	}

	due, show = NextPayDate(19, day(2026, time.October, 20), paid(2026, time.October, 19), loc)
	if show || due.Month() != time.November {
		t.Fatalf("already paid: got %s show=%v", due, show)
	}
}
