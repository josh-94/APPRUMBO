package httpapi

import (
	"sort"
	"time"

	"hoy/internal/schedule"
	"hoy/internal/task"
)

func sortMyDay(tasks []task.Task) {
	sort.SliceStable(tasks, func(i, j int) bool {
		a, b := tasks[i], tasks[j]
		if a.Status != b.Status {
			return a.Status == task.StatusOpen
		}
		if a.Pinned != b.Pinned {
			return a.Pinned
		}
		return beforeDue(a, b)
	})
}

func sortByDue(tasks []task.Task) {
	sort.SliceStable(tasks, func(i, j int) bool {
		return beforeDue(tasks[i], tasks[j])
	})
}

func sortMoment(tasks []task.Task, now time.Time, loc *time.Location) {
	sort.SliceStable(tasks, func(i, j int) bool {
		ra := task.MomentRank(tasks[i], now, loc)
		rb := task.MomentRank(tasks[j], now, loc)
		if ra != rb {
			return ra < rb
		}
		return beforeDue(tasks[i], tasks[j])
	})
}

func sortManual(tasks []task.Task) {
	sort.SliceStable(tasks, func(i, j int) bool {
		a, b := tasks[i], tasks[j]
		if a.Status != b.Status {
			return a.Status == task.StatusOpen
		}
		if a.Position != b.Position {
			return a.Position < b.Position
		}
		return a.ID < b.ID
	})
}

func sortBySection(tasks []task.Task, now time.Time, loc *time.Location) {
	sort.SliceStable(tasks, func(i, j int) bool {
		a, b := tasks[i], tasks[j]
		if a.Status != b.Status {
			return a.Status == task.StatusOpen
		}
		sa := sectionRank(schedule.SectionFor(a.DueAt, now, loc))
		sb := sectionRank(schedule.SectionFor(b.DueAt, now, loc))
		if sa != sb {
			return sa < sb
		}
		return beforeDue(a, b)
	})
}

func sectionRank(section schedule.Section) int {
	switch section {
	case schedule.SectionToday:
		return 0
	case schedule.SectionTomorrow:
		return 1
	case schedule.SectionUpcoming:
		return 2
	default:
		return 3
	}
}

func beforeDue(a, b task.Task) bool {
	if a.DueAt == nil {
		return false
	}
	if b.DueAt == nil {
		return true
	}
	if a.DueAt.Equal(*b.DueAt) {
		return a.ID < b.ID
	}
	return a.DueAt.Before(*b.DueAt)
}
