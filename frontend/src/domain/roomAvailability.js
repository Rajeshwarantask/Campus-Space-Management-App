const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function resolvePeriodRange(periods, startNumber, endNumber) {
  const start = periods.find((period) => Number(period.period_number) === Number(startNumber));
  const end = periods.find((period) => Number(period.period_number) === Number(endNumber));
  if (!start || !end || Number(startNumber) > Number(endNumber)) return null;
  const startMatch = String(start.starts_at || '').match(TIME_PATTERN);
  const endMatch = String(end.ends_at || '').match(TIME_PATTERN);
  if (!startMatch || !endMatch) return null;
  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  const startSeconds = Number(startMatch[3] || 0);
  const endSeconds = Number(endMatch[3] || 0);
  if (endMinutes * 60 + endSeconds <= startMinutes * 60 + startSeconds) return null;
  return { start: `${startMatch[1]}:${startMatch[2]}:${String(startSeconds).padStart(2, '0')}`, end: `${endMatch[1]}:${endMatch[2]}:${String(endSeconds).padStart(2, '0')}`, startPeriod: Number(startNumber), endPeriod: Number(endNumber) };
}

export function timeRangesOverlap(requestStart, requestEnd, assignmentStart, assignmentEnd) {
  const toSeconds = (value) => {
    const match = String(value || '').match(TIME_PATTERN);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : null;
  };
  const start = toSeconds(requestStart);
  const end = toSeconds(requestEnd);
  const assignmentFrom = toSeconds(assignmentStart);
  const assignmentTo = toSeconds(assignmentEnd);
  return start !== null && end !== null && assignmentFrom !== null && assignmentTo !== null && start < assignmentTo && end > assignmentFrom;
}

export function academicRoomStatus(roomId, start, end, entries, completenessStatus) {
  const assignments = entries.filter((entry) => entry.room_id === roomId && entry.is_active !== false && timeRangesOverlap(start, end, entry.starts_at, entry.ends_at));
  if (assignments.length) return { status: 'occupied', assignments };
  return { status: ['complete', 'published'].includes(completenessStatus) ? 'available' : 'unknown', assignments: [] };
}

export function campusLocalToUtc(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIME_PATTERN.test(time)) return null;
  const [hour, minute, second = '0'] = time.split(':');
  const candidate = new Date(`${date}T${hour}:${minute}:${String(second).padStart(2, '0')}Z`);
  if (Number.isNaN(candidate.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(candidate).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const viewed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    const wanted = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Number(hour), Number(minute), Number(second));
    return new Date(candidate.getTime() + wanted - viewed);
  } catch {
    return null;
  }
}
