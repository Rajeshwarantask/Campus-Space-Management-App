import { DEFAULT_PERIODS, deriveFacultyPeriods, deriveRoomAvailability, deriveSectionPeriods, explainAvailability, filterRooms, getAcademicPeriods, getPeriodInterval, intervalOverlaps, isOperationallyAvailable, isPastInterval, resolveAcademicDay, utilizationSummary } from './timetable';

test('uses half-open intervals for room conflicts', () => {
  expect(intervalOverlaps('2026-10-15T09:00:00Z', '2026-10-15T10:00:00Z', '2026-10-15T10:00:00Z', '2026-10-15T11:00:00Z')).toBe(false);
  expect(intervalOverlaps('2026-10-15T09:30:00Z', '2026-10-15T10:30:00Z', '2026-10-15T10:00:00Z', '2026-10-15T11:00:00Z')).toBe(true);
});

test('returns evidence for teaching, closures, and reservations', () => {
  const start = '2026-10-15T09:00:00Z';
  const end = '2026-10-15T10:00:00Z';
  expect(explainAvailability('room-1', start, end, [], [{ room_id: 'room-1', starts_at: start, ends_at: end }], []).reason).toBe('scheduled_teaching');
  expect(explainAvailability('room-1', start, end, [], [], [{ room_id: 'room-1', starts_at: start, ends_at: end }]).reason).toBe('room_closure');
  expect(explainAvailability('room-1', start, end, [{ room_id: 'room-1', status: 'confirmed', starts_at: start, ends_at: end }], [], []).reason).toBe('active_reservation');
});

test('filters optional room criteria without requiring any one filter', () => {
  const rooms = [{ id: 1, building: 'North', floor: 2, capacity: 40, equipment: ['Projector'], is_active: true }, { id: 2, building: 'South', floor: 1, capacity: 20, equipment: ['Computers'], is_active: true }];
  expect(filterRooms(rooms)).toHaveLength(2);
  expect(filterRooms(rooms, { building: 'North', capacity: 30, equipment: 'Projector' })).toHaveLength(1);
});

test('rejects past intervals and resolves academic holidays', () => {
  expect(isPastInterval('2026-10-14T09:00:00Z', new Date('2026-10-15T00:00:00Z'))).toBe(true);
  expect(resolveAcademicDay('2026-10-15', { start_date: '2026-08-01', end_date: '2026-12-01', holidays: [{ date: '2026-10-15', reason: 'Festival holiday' }] })).toEqual({ applicable: false, reason: 'Festival holiday' });
});

test('resolves consecutive period intervals', () => {
  expect(getPeriodInterval(2, 2, DEFAULT_PERIODS)).toEqual({ start: '10:00', end: '12:00', period: 'Period 2', duration: 2 });
});

test('separates teaching, reservation, and closure utilization', () => {
  expect(utilizationSummary([{ is_active: true }], [{ status: 'published' }], [{ status: 'confirmed' }], [{ id: 1 }])).toMatchObject({ teachingIntervals: 1, reservationIntervals: 1, closureIntervals: 1, hasData: true });
});

test('marks a room with a timetable assignment occupied and leaves unmatched rooms academically free', () => {
  const rooms = [{ id: 'r1', is_active: true }, { id: 'r2', is_active: true }];
  const result = deriveRoomAvailability(rooms, [{ room_id: 'r1', period: 2 }]);
  expect(result.map(({ occupied }) => occupied)).toEqual([true, false]);
  expect(result[0].assignments).toHaveLength(1);
});

test('derives configured faculty periods from timetable entries', () => {
  const entries = [{ day_of_week: 1, period: 1, starts_at: '09:00:00', ends_at: '09:40:00', faculty_id: 'f1', room_id: 'r1', subject: 'Networks' }];
  const periods = getAcademicPeriods(entries);
  expect(deriveFacultyPeriods('f1', entries, [{ index: 1 }, { index: 2 }]).map(({ entry }) => entry?.subject || null)).toEqual(['Networks', null]);
  expect(periods).toEqual([{ index: 1, start: '09:00', end: '09:40' }]);
});

test('does not derive section free time without a section relationship', () => {
  expect(deriveSectionPeriods('year-3-c', [{ period: 1, faculty_id: 'f1' }], [{ index: 1 }])).toBeNull();
});

test('recognizes room operational restrictions separately from academic vacancy', () => {
  expect(isOperationallyAvailable({ is_active: true, operational_status: 'maintenance' })).toBe(false);
  expect(isOperationallyAvailable({ is_active: true, operational_status: 'available' })).toBe(true);
});
