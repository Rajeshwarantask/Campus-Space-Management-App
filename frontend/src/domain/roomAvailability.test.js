import { academicRoomStatus, campusLocalToUtc, resolvePeriodRange, timeRangesOverlap } from './roomAvailability';

const periods = [
  { period_number: 2, starts_at: '09:00:00', ends_at: '09:50:00' },
  { period_number: 3, starts_at: '09:50:00', ends_at: '10:40:00' },
  { period_number: 4, starts_at: '10:50:00', ends_at: '11:40:00' },
];

test('resolves a range using canonical period endpoints and preserves a gap', () => {
  expect(resolvePeriodRange(periods, 2, 4)).toEqual({ start: '09:00:00', end: '11:40:00', startPeriod: 2, endPeriod: 4 });
  expect(resolvePeriodRange(periods, 4, 2)).toBeNull();
  expect(resolvePeriodRange(periods, 2, 5)).toBeNull();
});

test('detects assignments anywhere in the interval with half-open boundaries', () => {
  const middle = [{ room_id: 'r1', starts_at: '10:00:00', ends_at: '10:15:00' }];
  expect(academicRoomStatus('r1', '09:00:00', '11:40:00', middle, 'complete').status).toBe('occupied');
  expect(timeRangesOverlap('09:00:00', '10:00:00', '10:00:00', '10:40:00')).toBe(false);
  expect(timeRangesOverlap('09:00:00', '10:01:00', '10:00:00', '10:40:00')).toBe(true);
  expect(timeRangesOverlap('10:40:00', '11:00:00', '10:00:00', '10:40:00')).toBe(false);
});

test('requires institution completeness to call an empty interval free', () => {
  expect(academicRoomStatus('r1', '09:00:00', '11:40:00', [], 'complete').status).toBe('available');
  expect(academicRoomStatus('r1', '09:00:00', '11:40:00', [], 'published').status).toBe('available');
  expect(academicRoomStatus('r1', '09:00:00', '11:40:00', [], 'in_progress').status).toBe('unknown');
  expect(academicRoomStatus('r1', '09:00:00', '11:40:00', [], undefined).status).toBe('unknown');
});

test('converts campus-local period timestamps while preserving seconds', () => {
  expect(campusLocalToUtc('2026-11-24', '09:00:30', 'Asia/Kolkata').toISOString()).toBe('2026-11-24T03:30:30.000Z');
  expect(campusLocalToUtc('2026-11-24', '09:00', 'Asia/Kolkata').toISOString()).toBe('2026-11-24T03:30:00.000Z');
  expect(campusLocalToUtc('2026-11-24', 'invalid', 'Asia/Kolkata')).toBeNull();
});
