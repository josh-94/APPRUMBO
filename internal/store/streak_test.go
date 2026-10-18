package store

import "testing"
import "time"

func TestStreakWeeksKeepsPastWeeksUntilSunday(t *testing.T) {
	// Wednesday 7 Oct 2026. Previous week Mon 28 Sep had 5 checks. This week has 1.
	days := []string{"2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-07"}
	today := time.Date(2026, 10, 7, 12, 0, 0, 0, time.UTC)
	if got := StreakWeeks(days, 5, today); got != 1 {
		t.Fatalf("racha = %d, want 1", got)
	}
}

func TestStreakWeeksResetsOnSunday(t *testing.T) {
	days := []string{"2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"}
	sunday := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	if got := StreakWeeks(days, 5, sunday); got != 0 {
		t.Fatalf("racha domingo = %d, want 0", got)
	}
}

func TestStreakWeeksCountsCurrentWhenMet(t *testing.T) {
	days := []string{
		"2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
		"2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09",
	}
	today := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	if got := StreakWeeks(days, 5, today); got != 2 {
		t.Fatalf("racha = %d, want 2", got)
	}
}

func TestStreakDaysFromYesterdayWhenTodayOpen(t *testing.T) {
	days := []string{"2026-10-15", "2026-10-16"}
	today := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	if got := StreakDays(days, today); got != 2 {
		t.Fatalf("racha días = %d, want 2", got)
	}
}

func TestStreakDaysIncludesToday(t *testing.T) {
	days := []string{"2026-10-16", "2026-10-17"}
	today := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	if got := StreakDays(days, today); got != 2 {
		t.Fatalf("racha días = %d, want 2", got)
	}
}
