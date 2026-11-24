import { explainAcademicError, isCalendarDate, validateDateRange, validatePeriod, validateSection, validateSubject, validateTimetableEntry } from './academic';

test('validates real calendar dates and date ordering', () => {
  expect(isCalendarDate('2026-02-28')).toBe(true);
  expect(isCalendarDate('2026-02-30')).toBe(false);
  expect(validateDateRange('Semester 1', '2026-08-01', '2026-12-01')).toBe('');
  expect(validateDateRange('Semester 1', '2026-12-01', '2026-08-01')).toMatch(/on or after/);
});

test('validates section and subject fields before database submission', () => {
  expect(validateSection({ code: '3-C', name: 'Third year C', yearOfStudy: '3' })).toBe('');
  expect(validateSection({ code: '3-C', name: 'Third year C', yearOfStudy: '11' })).toMatch(/1 to 10/);
  expect(validateSubject({ name: '  Operating Systems ', code: 'OS301' })).toBe('');
  expect(validateSubject({ name: '  ', code: '' })).toMatch(/subject name/);
});

test('requires valid times and active canonical period for timetable forms', () => {
  expect(validatePeriod({ periodNumber: '2', startsAt: '09:40', endsAt: '10:20', displayName: 'Period 2' })).toBe('');
  expect(validatePeriod({ periodNumber: '2', startsAt: '10:20', endsAt: '09:40', displayName: 'Period 2' })).toMatch(/after/);
  expect(validateTimetableEntry({ termId: 'bad-id', sectionId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', dayOfWeek: 1, periodId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', subjectId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', facultyId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', roomId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', period: { period_number: 1 } })).toMatch(/invalid/);
  expect(validateTimetableEntry({ termId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', sectionId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', dayOfWeek: 1, periodId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', subjectId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', facultyId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', roomId: '5b6d06ac-6fc5-4e8a-a30e-e9732a3874ce', period: { period_number: 1 } })).toBe('');
});

test('explains database-enforced scheduling conflicts', () => {
  expect(explainAcademicError({ message: 'conflicting key value violates exclusion constraint "timetable_faculty_no_overlap"' })).toMatch(/faculty member/);
  expect(explainAcademicError({ message: 'conflicting key value violates exclusion constraint "timetable_room_no_overlap"' })).toMatch(/room/);
});
