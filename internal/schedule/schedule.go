package schedule

import "time"

// Weekday bits use ISO days: Monday is bit 0, Sunday is bit 6.

func Mask(isoWeekdays []int) int {
	var mask int
	for _, day := range isoWeekdays {
		if day >= 1 && day <= 7 {
			mask |= 1 << (day - 1)
		}
	}
	return mask
}

func Weekdays(mask int) []int {
	out := make([]int, 0, 7)
	for day := 1; day <= 7; day++ {
		if mask&(1<<(day-1)) != 0 {
			out = append(out, day)
		}
	}
	return out
}

func ISOWeekday(t time.Time) int {
	day := int(t.Weekday())
	if day == 0 {
		return 7
	}
	return day
}

func Matches(mask int, t time.Time, loc *time.Location) bool {
	if mask == 0 {
		return false
	}
	iso := ISOWeekday(t.In(loc))
	return mask&(1<<(iso-1)) != 0
}

func StartOfDay(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
}

func SameDay(a, b time.Time, loc *time.Location) bool {
	return StartOfDay(a, loc).Equal(StartOfDay(b, loc))
}

func DayKey(t time.Time, loc *time.Location) string {
	return t.In(loc).Format("2006-01-02")
}

type Section string

const (
	SectionToday    Section = "today"
	SectionTomorrow Section = "tomorrow"
	SectionUpcoming Section = "upcoming"
	SectionSomeday  Section = "someday"
)

func SectionFor(due *time.Time, now time.Time, loc *time.Location) Section {
	if due == nil {
		return SectionSomeday
	}
	today := StartOfDay(now, loc)
	dueDay := StartOfDay(*due, loc)
	switch {
	case !dueDay.After(today):
		return SectionToday
	case dueDay.Equal(today.AddDate(0, 0, 1)):
		return SectionTomorrow
	default:
		return SectionUpcoming
	}
}

// NextAfter is the next matching weekday and clock strictly after from.
func NextAfter(from time.Time, mask int, hour, minute int, loc *time.Location) (time.Time, bool) {
	if mask == 0 {
		return time.Time{}, false
	}
	local := from.In(loc)
	for i := 0; i <= 7; i++ {
		day := StartOfDay(local, loc).AddDate(0, 0, i)
		iso := ISOWeekday(day)
		if mask&(1<<(iso-1)) == 0 {
			continue
		}
		candidate := time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, loc)
		if candidate.After(from) {
			return candidate, true
		}
	}
	return time.Time{}, false
}
