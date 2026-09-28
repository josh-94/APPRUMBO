from datetime import datetime
from zoneinfo import ZoneInfo

from hoy.schedule import mask, next_after, section_for, weekdays
from hoy.tasks import in_my_day, in_week
from hoy.tasks import Task

LOC = ZoneInfo("America/Bogota")


def test_mask_round_trip():
    assert weekdays(mask([1, 5, 7])) == [1, 5, 7]


def test_next_after_skips_passed_slot():
    start = datetime(2026, 9, 25, 9, 0, tzinfo=LOC)
    nxt = next_after(start, mask([5]), 8, 0, LOC)
    assert nxt == datetime(2026, 10, 2, 8, 0, tzinfo=LOC)


def test_next_after_keeps_later_today():
    start = datetime(2026, 9, 25, 7, 0, tzinfo=LOC)
    nxt = next_after(start, mask([5]), 8, 0, LOC)
    assert nxt == datetime(2026, 9, 25, 8, 0, tzinfo=LOC)


def test_section_overdue_is_today():
    now = datetime(2026, 9, 25, 12, 0, tzinfo=LOC)
    due = datetime(2026, 9, 24, 8, 0, tzinfo=LOC)
    assert section_for(due, now, LOC) == "today"
    assert section_for(None, now, LOC) == "someday"
    tomorrow = datetime(2026, 9, 26, 8, 0, tzinfo=LOC)
    assert section_for(tomorrow, now, LOC) == "tomorrow"


def test_my_day_includes_overdue_and_pinned():
    now = datetime(2026, 9, 25, 12, 0, tzinfo=LOC)
    overdue = Task(status="open", due_at=datetime(2026, 9, 24, 8, 0, tzinfo=LOC))
    pinned = Task(status="open", pinned=True)
    later = Task(status="open", due_at=datetime(2026, 9, 30, 8, 0, tzinfo=LOC))
    assert in_my_day(overdue, now, LOC)
    assert in_my_day(pinned, now, LOC)
    assert not in_my_day(later, now, LOC)


def test_week_window():
    now = datetime(2026, 9, 25, 12, 0, tzinfo=LOC)
    inside = Task(status="open", due_at=datetime(2026, 9, 28, 8, 0, tzinfo=LOC))
    outside = Task(status="open", due_at=datetime(2026, 10, 3, 8, 0, tzinfo=LOC))
    assert in_week(inside, now, LOC)
    assert not in_week(outside, now, LOC)
