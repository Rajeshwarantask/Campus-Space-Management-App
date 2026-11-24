export const TIMETABLE_CSV_HEADERS = ['day_of_week', 'period', 'section', 'subject', 'faculty', 'room_code'];
export const TIMETABLE_CSV_TEMPLATE = `${TIMETABLE_CSV_HEADERS.join(',')}\n# EXAMPLE ONLY: Monday,1,3-C,Software Engineering,Dr. Kavitha,Room 804\n# EXAMPLE ONLY: Wednesday,2,3-C,Operating Systems,Dr. Meera,LAB-02\n`;
const DAYS = { monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 7, sun: 7 };

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      if (field.length) throw new Error('Unexpected quote in an unquoted CSV field.');
      quoted = true;
    } else if (char === ',') { row.push(field.trim()); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field.trim()); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  if (!rows.length) throw new Error('The CSV file is empty.');
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, '').trim().toLowerCase());
  if (headers.some((header) => !header)) throw new Error('Headers cannot be empty.');
  if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate headers.');
  const missing = TIMETABLE_CSV_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);
  if (headers.some((header) => !TIMETABLE_CSV_HEADERS.includes(header))) throw new Error('Remove unrecognized columns and use the provided template.');
  return rows.map((values, index) => ({ values, line: index + 2 }))
    .filter(({ values }) => !values[0]?.startsWith('# EXAMPLE ONLY:'))
    .map(({ values, line }) => {
      if (values.length !== headers.length) throw new Error(`Row ${line} has ${values.length} values; expected ${headers.length}.`);
      return { line, ...Object.fromEntries(headers.map((header, position) => [header, values[position]])) };
    });
}

export function normalizeEntityName(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
export function matchEntity(options, value, fields) {
  const needle = normalizeEntityName(value);
  return options.filter((item) => fields.some((field) => normalizeEntityName(item[field]) === needle));
}
export function parseDay(value) { return DAYS[normalizeEntityName(value)] || (/^[1-7]$/.test(String(value).trim()) ? Number(value) : null); }
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }
