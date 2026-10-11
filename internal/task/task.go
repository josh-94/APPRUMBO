package task

import (
	"strings"
	"time"

	"hoy/internal/schedule"
)

const (
	StatusOpen = "open"
	StatusDone = "done"
)

type Task struct {
	ID          int64
	ListID      int64
	Title       string
	Notes       string
	DueAt       *time.Time
	RemindAt    *time.Time
	Status      string
	Pinned      bool
	Position    int
	RepeatMask  int
	CompletedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
	WantRemind  bool
	PayKind     string
	PayRef      int64
}

type ValidationError struct{ Message string }

func (e *ValidationError) Error() string { return e.Message }

func Normalize(in Task, now time.Time, loc *time.Location) (Task, error) {
	in.Title = strings.TrimSpace(in.Title)
	in.Notes = strings.TrimSpace(in.Notes)
	if in.Title == "" {
		return Task{}, &ValidationError{Message: "El título es obligatorio"}
	}
	if len([]rune(in.Title)) > 200 {
		return Task{}, &ValidationError{Message: "El título es demasiado largo"}
	}
	if len([]rune(in.Notes)) > 4000 {
		return Task{}, &ValidationError{Message: "La nota es demasiado larga"}
	}
	if in.RepeatMask != 0 {
		hour, minute := 8, 0
		if in.DueAt != nil {
			local := in.DueAt.In(loc)
			hour, minute = local.Hour(), local.Minute()
		}
		if in.DueAt != nil && in.DueAt.After(now) && schedule.Matches(in.RepeatMask, *in.DueAt, loc) {
			// Keep a future occurrence that already falls on a selected day.
		} else if next, ok := schedule.NextAfter(now, in.RepeatMask, hour, minute, loc); ok {
			in.DueAt = &next
		}
	}
	if in.WantRemind {
		if in.DueAt == nil {
			return Task{}, &ValidationError{Message: "Un recordatorio necesita fecha y hora"}
		}
		remind := *in.DueAt
		in.RemindAt = &remind
	} else {
		in.RemindAt = nil
	}
	if in.Status == "" {
		in.Status = StatusOpen
	}
	return in, nil
}

func ApplyDone(t Task, now time.Time, loc *time.Location) Task {
	if t.RepeatMask != 0 {
		hour, minute := clock(t, loc)
		if next, ok := schedule.NextAfter(now, t.RepeatMask, hour, minute, loc); ok {
			t.Status = StatusOpen
			t.DueAt = &next
			if t.RemindAt != nil {
				remind := next
				t.RemindAt = &remind
			}
			done := now
			t.CompletedAt = &done
			return t
		}
	}
	t.Status = StatusDone
	done := now
	t.CompletedAt = &done
	t.RemindAt = nil
	return t
}

func ApplyToday(t Task, now time.Time, loc *time.Location) Task {
	hour, minute := 9, 0
	if t.DueAt != nil {
		local := t.DueAt.In(loc)
		hour, minute = local.Hour(), local.Minute()
	} else if t.RepeatMask != 0 {
		hour, minute = 8, 0
	}
	local := now.In(loc)
	due := time.Date(local.Year(), local.Month(), local.Day(), hour, minute, 0, 0, loc)
	t.Status = StatusOpen
	t.DueAt = &due
	if t.RemindAt != nil {
		remind := due
		t.RemindAt = &remind
	}
	return t
}

func ApplyLater(t Task, due time.Time) Task {
	t.Status = StatusOpen
	t.DueAt = &due
	if t.RemindAt != nil {
		remind := due
		t.RemindAt = &remind
	}
	return t
}

func InMyDay(t Task, now time.Time, loc *time.Location) bool {
	if t.Status == StatusDone {
		return t.CompletedAt != nil && schedule.SameDay(*t.CompletedAt, now, loc)
	}
	if t.Pinned {
		return true
	}
	if t.DueAt == nil {
		return false
	}
	return !schedule.StartOfDay(*t.DueAt, loc).After(schedule.StartOfDay(now, loc))
}

func InWeek(t Task, now time.Time, loc *time.Location) bool {
	if t.Status != StatusOpen || t.DueAt == nil {
		return false
	}
	start := schedule.StartOfDay(now, loc)
	end := start.AddDate(0, 0, 7)
	due := t.DueAt.In(loc)
	return !due.Before(start) && due.Before(end)
}

func MomentRank(t Task, now time.Time, loc *time.Location) int {
	if t.DueAt == nil {
		return 1
	}
	if t.DueAt.Before(schedule.StartOfDay(now, loc)) {
		return 0
	}
	switch schedule.SectionFor(t.DueAt, now, loc) {
	case schedule.SectionToday:
		return 3
	default:
		return 2
	}
}

func clock(t Task, loc *time.Location) (int, int) {
	if t.DueAt != nil {
		local := t.DueAt.In(loc)
		return local.Hour(), local.Minute()
	}
	if t.RemindAt != nil {
		local := t.RemindAt.In(loc)
		return local.Hour(), local.Minute()
	}
	return 8, 0
}
