from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .schedule import matches, next_after, same_day, section_for, start_of_day

OPEN = "open"
DONE = "done"


class ValidationError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass
class Task:
    id: int = 0
    list_id: int = 0
    title: str = ""
    notes: str = ""
    due_at: datetime | None = None
    remind_at: datetime | None = None
    status: str = OPEN
    pinned: bool = False
    position: int = 0
    repeat_mask: int = 0
    completed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    want_remind: bool = False


def normalize(item: Task, now: datetime, loc: ZoneInfo) -> Task:
    item.title = item.title.strip()
    item.notes = item.notes.strip()
    if not item.title:
        raise ValidationError("El título es obligatorio")
    if len(item.title) > 200:
        raise ValidationError("El título es demasiado largo")
    if len(item.notes) > 4000:
        raise ValidationError("La nota es demasiado larga")
    if item.repeat_mask:
        hour, minute = 8, 0
        if item.due_at is not None:
            local = item.due_at.astimezone(loc)
            hour, minute = local.hour, local.minute
        keep = (
            item.due_at is not None
            and item.due_at > now
            and matches(item.repeat_mask, item.due_at, loc)
        )
        if not keep:
            nxt = next_after(now, item.repeat_mask, hour, minute, loc)
            if nxt is not None:
                item.due_at = nxt
    if item.want_remind:
        if item.due_at is None:
            raise ValidationError("Un recordatorio necesita fecha y hora")
        item.remind_at = item.due_at
    else:
        item.remind_at = None
    if not item.status:
        item.status = OPEN
    return item


def _clock(item: Task, loc: ZoneInfo) -> tuple[int, int]:
    if item.due_at is not None:
        local = item.due_at.astimezone(loc)
        return local.hour, local.minute
    if item.remind_at is not None:
        local = item.remind_at.astimezone(loc)
        return local.hour, local.minute
    return 8, 0


def apply_done(item: Task, now: datetime, loc: ZoneInfo) -> Task:
    if item.repeat_mask:
        hour, minute = _clock(item, loc)
        nxt = next_after(now, item.repeat_mask, hour, minute, loc)
        if nxt is not None:
            item.status = OPEN
            item.due_at = nxt
            if item.remind_at is not None:
                item.remind_at = nxt
            item.completed_at = now
            return item
    item.status = DONE
    item.completed_at = now
    item.remind_at = None
    return item


def apply_today(item: Task, now: datetime, loc: ZoneInfo) -> Task:
    hour, minute = 9, 0
    if item.due_at is not None:
        local = item.due_at.astimezone(loc)
        hour, minute = local.hour, local.minute
    elif item.repeat_mask:
        hour, minute = 8, 0
    local = now.astimezone(loc)
    due = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    item.status = OPEN
    item.due_at = due
    if item.remind_at is not None:
        item.remind_at = due
    return item


def apply_later(item: Task, due: datetime) -> Task:
    item.status = OPEN
    item.due_at = due
    if item.remind_at is not None:
        item.remind_at = due
    return item


def in_my_day(item: Task, now: datetime, loc: ZoneInfo) -> bool:
    if item.status == DONE:
        return item.completed_at is not None and same_day(item.completed_at, now, loc)
    if item.pinned:
        return True
    if item.due_at is None:
        return False
    return start_of_day(item.due_at, loc) <= start_of_day(now, loc)


def in_week(item: Task, now: datetime, loc: ZoneInfo) -> bool:
    if item.status != OPEN or item.due_at is None:
        return False
    start = start_of_day(now, loc)
    end = start + timedelta(days=7)
    due = item.due_at.astimezone(loc)
    return start <= due < end


def moment_rank(item: Task, now: datetime, loc: ZoneInfo) -> int:
    if item.due_at is None:
        return 1
    if item.due_at < start_of_day(now, loc):
        return 0
    if section_for(item.due_at, now, loc) == TODAY:
        return 3
    return 2
