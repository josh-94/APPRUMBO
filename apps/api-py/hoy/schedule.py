from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TODAY = "today"
TOMORROW = "tomorrow"
UPCOMING = "upcoming"
SOMEDAY = "someday"


def mask(iso_weekdays: list[int] | None) -> int:
    value = 0
    for day in iso_weekdays or []:
        if 1 <= day <= 7:
            value |= 1 << (day - 1)
    return value


def weekdays(bits: int) -> list[int]:
    return [day for day in range(1, 8) if bits & (1 << (day - 1))]


def iso_weekday(moment: datetime, loc: ZoneInfo) -> int:
    return moment.astimezone(loc).isoweekday()


def matches(bits: int, moment: datetime, loc: ZoneInfo) -> bool:
    if bits == 0:
        return False
    return bool(bits & (1 << (iso_weekday(moment, loc) - 1)))


def start_of_day(moment: datetime, loc: ZoneInfo) -> datetime:
    local = moment.astimezone(loc)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def same_day(a: datetime, b: datetime, loc: ZoneInfo) -> bool:
    return start_of_day(a, loc) == start_of_day(b, loc)


def day_key(moment: datetime, loc: ZoneInfo) -> str:
    return moment.astimezone(loc).strftime("%Y-%m-%d")


def section_for(due: datetime | None, now: datetime, loc: ZoneInfo) -> str:
    if due is None:
        return SOMEDAY
    today = start_of_day(now, loc)
    due_day = start_of_day(due, loc)
    if due_day <= today:
        return TODAY
    if due_day == today + timedelta(days=1):
        return TOMORROW
    return UPCOMING


def next_after(start: datetime, bits: int, hour: int, minute: int, loc: ZoneInfo) -> datetime | None:
    if bits == 0:
        return None
    local = start.astimezone(loc)
    origin = start_of_day(local, loc)
    for offset in range(8):
        day = origin + timedelta(days=offset)
        if bits & (1 << (day.isoweekday() - 1)) == 0:
            continue
        candidate = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate > start.astimezone(loc):
            return candidate
    return None
