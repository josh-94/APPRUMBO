package task

import (
	"testing"
	"time"

	"hoy/internal/schedule"
)

func TestApplyDoneAdvancesRoutine(t *testing.T) {
	loc := mustLoc(t)
	now := time.Date(2026, 9, 25, 9, 0, 0, 0, loc)
	due := time.Date(2026, 9, 25, 8, 0, 0, 0, loc)
	remind := due
	got := ApplyDone(Task{
		Title:      "Estirar",
		DueAt:      &due,
		RemindAt:   &remind,
		Status:     StatusOpen,
		RepeatMask: schedule.Mask([]int{5}),
	}, now, loc)
	if got.Status != StatusOpen {
		t.Fatal("routine stays open")
	}
	want := time.Date(2026, 10, 2, 8, 0, 0, 0, loc)
	if got.DueAt == nil || !got.DueAt.Equal(want) {
		t.Fatalf("due %v", got.DueAt)
	}
	if got.RemindAt == nil || !got.RemindAt.Equal(want) {
		t.Fatal("reminder should move with the routine")
	}
}

func TestApplyDoneClosesOneShot(t *testing.T) {
	loc := mustLoc(t)
	now := time.Date(2026, 9, 25, 9, 0, 0, 0, loc)
	due := now
	remind := now
	got := ApplyDone(Task{DueAt: &due, RemindAt: &remind, Status: StatusOpen}, now, loc)
	if got.Status != StatusDone || got.RemindAt != nil {
		t.Fatalf("status %s remind %v", got.Status, got.RemindAt)
	}
}

func TestMyDayAndWeek(t *testing.T) {
	loc := mustLoc(t)
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, loc)
	yesterday := now.AddDate(0, 0, -1)
	nextWeek := now.AddDate(0, 0, 8)
	tomorrow := now.AddDate(0, 0, 1)
	doneAt := now
	cases := []struct {
		name string
		task Task
		day  bool
		week bool
	}{
		{"overdue", Task{Status: StatusOpen, DueAt: &yesterday}, true, false},
		{"pinned later", Task{Status: StatusOpen, Pinned: true, DueAt: &nextWeek}, true, false},
		{"someday", Task{Status: StatusOpen}, false, false},
		{"done today", Task{Status: StatusDone, CompletedAt: &doneAt}, true, false},
		{"tomorrow", Task{Status: StatusOpen, DueAt: &tomorrow}, false, true},
	}
	for _, tc := range cases {
		if InMyDay(tc.task, now, loc) != tc.day {
			t.Fatalf("%s my day", tc.name)
		}
		if InWeek(tc.task, now, loc) != tc.week {
			t.Fatalf("%s week", tc.name)
		}
	}
}

func TestNormalizeRequiresTitleAndReminderDate(t *testing.T) {
	loc := mustLoc(t)
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, loc)
	if _, err := Normalize(Task{}, now, loc); err == nil {
		t.Fatal("expected title error")
	}
	if _, err := Normalize(Task{Title: "A", WantRemind: true}, now, loc); err == nil {
		t.Fatal("expected reminder error")
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
