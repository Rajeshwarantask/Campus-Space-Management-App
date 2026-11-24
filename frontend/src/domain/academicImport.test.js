import { intervalsOverlap, matchEntity, parseCsv, parseDay, TIMETABLE_CSV_HEADERS, TIMETABLE_CSV_TEMPLATE } from './academicImport';

const header = TIMETABLE_CSV_HEADERS.join(',');

describe('timetable CSV import parsing', () => {
  test('parses regular rows and quoted commas', () => {
    expect(parseCsv(`${header}\nMonday,1,3-C,"Software, Engineering",Dr. Kavitha,Room 804`)).toEqual([
      { line: 2, day_of_week: 'Monday', period: '1', section: '3-C', subject: 'Software, Engineering', faculty: 'Dr. Kavitha', room_code: 'Room 804' },
    ]);
  });

  test('rejects missing, duplicate, malformed, and empty files', () => {
    expect(() => parseCsv('')).toThrow(/empty/i);
    expect(() => parseCsv('day_of_week,period,section')).toThrow(/missing required columns/i);
    expect(() => parseCsv(`${header},period\nMonday,1,3-C,Subject,Faculty,Room,1`)).toThrow(/duplicate headers/i);
    expect(() => parseCsv(`${header}\nMonday,1,3-C,"Subject,Faculty,Room`)).toThrow(/unclosed/i);
    expect(() => parseCsv(`${header}\nMonday,1,3-C,Subject,Faculty`)).toThrow(/expected/i);
  });

  test('never treats clearly marked template examples as import records', () => {
    expect(parseCsv(TIMETABLE_CSV_TEMPLATE)).toEqual([]);
  });

  test('recognizes weekday names and numeric day values', () => {
    expect(parseDay('Mon')).toBe(1);
    expect(parseDay('Sunday')).toBe(7);
    expect(parseDay('0')).toBeNull();
  });

  test('resolves exact catalog names and exposes unknown or ambiguous matches', () => {
    const catalog = [{ id: '1', name: 'Software Engineering' }, { id: '2', name: 'Software Engineering' }];
    expect(matchEntity(catalog, ' software   engineering ', ['name'])).toHaveLength(2);
    expect(matchEntity(catalog, 'Missing Subject', ['name'])).toEqual([]);
    expect(matchEntity([{ id: 'faculty-1', display_name: 'Dr. Kavitha' }], 'Dr. Kavitha', ['display_name'])).toEqual([{ id: 'faculty-1', display_name: 'Dr. Kavitha' }]);
    expect(matchEntity([{ id: 'room-1', code: 'Room 804' }], 'Room 804', ['code'])).toHaveLength(1);
  });

  test('uses half-open period intervals for overlap checks', () => {
    expect(intervalsOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
    expect(intervalsOverlap('09:00', '10:15', '10:00', '11:00')).toBe(true);
  });
});
