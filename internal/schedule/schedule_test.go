package schedule

import (
	"testing"
	"time"
)

func TestMaskRoundTrip(t *testing.T) {
	mask := Mask([]int{1, 5, 7})
	got := Weekdays(mask)
	want := []int{1, 5, 7}
	if len(got) != len(want) {
		t.Fatalf("weekdays %#v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("weekdays %#v", got)
		}
	}
}

func TestNextAfterSkipsPassedSlot(t *testing.T) {
	loc := mustLoc(t)
	// Friday 25 Sep 2026, 09:00. Friday 08:00 already passed.
	from := time.Date(2026, 9, 25, 9, 0, 0, 0, loc)
	next, ok := NextAfter(from, Mask([]int{5}), 8, 0, loc)
	if !ok {
		t.Fatal("expected next friday")
	}
	want := time.Date(2026, 10, 2, 8, 0, 0, 0, loc)
	if !next.Equal(want) {
		t.Fatalf("got %s want %s", next, want)
	}
}

func TestNextAfterKeepsLaterToday(t *testing.T) {
	loc := mustLoc(t)
	from := time.Date(2026, 9, 25, 7, 0, 0, 0, loc)
	next, ok := NextAfter(from, Mask([]int{5}), 8, 0, loc)
	if !ok {
		t.Fatal("expected today")
	}
	want := time.Date(2026, 9, 25, 8, 0, 0, 0, loc)
	if !next.Equal(want) {
		t.Fatalf("got %s want %s", next, want)
	}
}

func TestSectionOverdueIsToday(t *testing.T) {
	loc := mustLoc(t)
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, loc)
	due := time.Date(2026, 9, 24, 8, 0, 0, 0, loc)
	if SectionFor(&due, now, loc) != SectionToday {
		t.Fatal("overdue should sit in today")
	}
	if SectionFor(nil, now, loc) != SectionSomeday {
		t.Fatal("nil due is someday")
	}
	tomorrow := time.Date(2026, 9, 26, 8, 0, 0, 0, loc)
	if SectionFor(&tomorrow, now, loc) != SectionTomorrow {
		t.Fatal("expected tomorrow")
	}
}

func mustLoc(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("America/Bogota")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}
