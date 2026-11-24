import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TIMETABLE_CSV_TEMPLATE, matchEntity, parseCsv, parseDay, intervalsOverlap } from '../domain/academicImport';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fileUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(TIMETABLE_CSV_TEMPLATE)}`;

export default function TimetableImport({ academicData, rooms, entries, onRefresh, onToast }) {
  const [termId, setTermId] = useState('');
  const [yearId, setYearId] = useState('');
  const [sourceRows, setSourceRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const [resolutions, setResolutions] = useState({});
  const terms = academicData.terms || [];
  const sections = (academicData.sections || []).filter((item) => item.term_id === termId && item.is_active);
  const periods = (academicData.periods || []).filter((item) => item.term_id === termId && item.is_active);
  const subjects = (academicData.subjects || []).filter((item) => item.is_active);
  const faculty = useMemo(() => academicData.facultyProfiles || [], [academicData.facultyProfiles]);
  const activeRooms = (rooms || []).filter((item) => item.is_active !== false && item.operational_status !== 'retired');

  const preview = useMemo(() => {
    if (!termId) return [];
    const seen = new Set();
    return sourceRows.map((row) => {
      const keyFor = (type) => resolutions[`${row.line}:${type}`];
      const resolve = (type, options, fields, raw) => {
        const matches = matchEntity(options, raw, fields);
        const selectedId = keyFor(type);
        const selected = matches.find((item) => item.id === selectedId);
        return { matches, item: selected || (matches.length === 1 ? matches[0] : null) };
      };
      const sectionResult = resolve('section', sections, ['code', 'name'], row.section);
      const subjectResult = resolve('subject', subjects, ['name', 'code'], row.subject);
      const facultyResult = resolve('faculty', faculty, ['display_name', 'staff_identifier'], row.faculty);
      const roomResult = resolve('room', activeRooms, ['code', 'name'], row.room_code);
      const day = parseDay(row.day_of_week);
      const periodNumber = /^\d+$/.test(row.period) ? Number(row.period) : NaN;
      const period = periods.find((item) => Number(item.period_number) === periodNumber);
      const unresolved = [sectionResult, subjectResult, facultyResult, roomResult].some(({ matches, item }) => matches.length > 1 && !item);
      const absent = [sectionResult, subjectResult, facultyResult, roomResult].some(({ matches }) => !matches.length);
      const messages = [];
      if (!days[day]) messages.push('Invalid weekday. Use Monday–Sunday or 1–7.');
      if (!Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 12) messages.push('Invalid period number.');
      else if (!period) messages.push('Period is not configured and active for the selected term.');
      if (sectionResult.matches.length === 0) messages.push(`Unknown section: ${row.section}.`);
      if (subjectResult.matches.length === 0) messages.push(`Unknown subject: ${row.subject}.`);
      if (facultyResult.matches.length === 0) messages.push(`Unknown faculty profile: ${row.faculty}.`);
      if (roomResult.matches.length === 0) messages.push(`Unknown room: ${row.room_code}.`);
      [sectionResult, subjectResult, facultyResult, roomResult].forEach(({ matches }, index) => {
        if (matches.length > 1 && ![sectionResult, subjectResult, facultyResult, roomResult][index].item) messages.push(`Ambiguous ${['section', 'subject', 'faculty', 'room'][index]}; choose a record below.`);
      });
      if (!row.day_of_week || !row.period || !row.section || !row.subject || !row.faculty || !row.room_code) messages.push('All six columns are required.');
      const selected = [sectionResult.item, subjectResult.item, facultyResult.item, roomResult.item];
      let status = messages.length ? (unresolved ? 'Requires resolution' : 'Invalid') : 'Ready to import';
      if (!messages.length) {
        const signature = `${day}|${period.id}|${selected[0].id}`;
        const duplicate = seen.has(signature) || entries.some((entry) => entry.is_active !== false && entry.term_id === termId && Number(entry.day_of_week) === day && entry.section_id === selected[0].id && Number(entry.period) === periodNumber);
        seen.add(signature);
        if (duplicate) { status = 'Duplicate'; messages.push('This section already has an equivalent class in this timetable or file.'); }
        else {
          const conflict = entries.find((entry) => entry.is_active !== false && entry.term_id === termId && Number(entry.day_of_week) === day && intervalsOverlap(period.starts_at, period.ends_at, entry.starts_at, entry.ends_at) && (entry.room_id === selected[3].id || entry.faculty_id === selected[2].id || entry.section_id === selected[0].id));
          const stagedConflict = sourceRows.slice(0, sourceRows.indexOf(row)).some((prior) => {
            const priorSection = resolve('section', sections, ['code', 'name'], prior.section).item;
            const priorSubject = resolve('subject', subjects, ['name', 'code'], prior.subject).item;
            const priorFaculty = resolve('faculty', faculty, ['display_name', 'staff_identifier'], prior.faculty).item;
            const priorRoom = resolve('room', activeRooms, ['code', 'name'], prior.room_code).item;
            const priorPeriod = periods.find((item) => Number(item.period_number) === Number(prior.period));
            const priorDay = parseDay(prior.day_of_week);
            return priorSection && priorSubject && priorFaculty && priorRoom && priorPeriod && priorDay === day && intervalsOverlap(period.starts_at, period.ends_at, priorPeriod.starts_at, priorPeriod.ends_at) && (priorSection.id === selected[0].id || priorFaculty.id === selected[2].id || priorRoom.id === selected[3].id);
          });
          if (conflict || stagedConflict) { status = 'Conflicting'; messages.push('Overlaps an existing or uploaded class for the same room, faculty member, or section.'); }
        }
      }
      return { ...row, day, period, section: sectionResult.item, subject: subjectResult.item, faculty: facultyResult.item, room: roomResult.item, sectionLabel: row.section, subjectLabel: row.subject, facultyLabel: row.faculty, roomLabel: row.room_code, sectionMatches: sectionResult.matches, subjectMatches: subjectResult.matches, facultyMatches: facultyResult.matches, roomMatches: roomResult.matches, status: absent ? (messages.length ? status : 'Invalid') : status, messages };
    });
  }, [sourceRows, termId, resolutions, sections, subjects, faculty, activeRooms, periods, entries]);

  const counts = preview.reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
  const validRows = preview.filter((row) => row.status === 'Ready to import');

  async function handleFile(event) {
    const file = event.target.files?.[0];
    setSourceRows([]); setResult(null); setError(''); setResolutions({});
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') return setError('Choose a CSV file.');
    if (file.size > MAX_FILE_BYTES) return setError('CSV files must be 2 MB or smaller.');
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error('The CSV has a header but no data rows.');
      setSourceRows(rows); setFileName(file.name);
    } catch (parseError) { setError(parseError.message || 'The CSV could not be parsed.'); }
  }

  async function confirmImport() {
    if (!validRows.length || working) return;
    const partial = validRows.length !== preview.length;
    const message = `Import ${validRows.length} valid row${validRows.length === 1 ? '' : 's'} into ${terms.find((item) => item.id === termId)?.name}? ${partial ? 'Invalid, duplicate, and conflicting rows will be skipped.' : 'This will not mark the timetable complete or publish it.'}`;
    if (!window.confirm(message)) return;
    setWorking(true); setError(''); setResult(null);
    const payload = validRows.map((row) => ({ day_of_week: row.day, period: Number(row.period.period_number), section_id: row.section.id, subject_id: row.subject.id, faculty_id: row.faculty.id, room_id: row.room.id }));
    const { data, error: importError } = await supabase.rpc('import_timetable_entries', { p_term_id: termId, p_entries: payload });
    setWorking(false);
    if (importError) {
      setResult({ imported: 0, rejected: validRows.length, message: importError.message || 'The database rejected this batch. No rows were imported.' });
      return;
    }
    setResult({ imported: Number(data), rejected: preview.length - validRows.length, message: '' });
    await onRefresh();
    onToast(`Imported ${Number(data)} scheduled class${Number(data) === 1 ? '' : 'es'}. Timetable completeness was not changed.`);
  }

  return <div className="academic-import-layout">
    <div className="academic-card"><div className="academic-heading-row"><div><p className="eyebrow">BULK SCHEDULE SETUP</p><h3>Import timetable</h3></div><a className="secondary-button" href={fileUrl} download="northstar-timetable-template.csv">Download CSV template</a></div>
      <p className="academic-helper">Choose a term, upload a spreadsheet exported as CSV, resolve every row in the preview, then explicitly confirm. Names must exactly match existing academic records; imports never create catalog entities.</p>
      <label>Academic year<select value={yearId} onChange={(event) => { setYearId(event.target.value); setTermId(''); setResult(null); }}><option value="">Choose an academic year</option>{(academicData.years || []).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
      <label>Academic term<select value={termId} onChange={(event) => { const selected = terms.find((item) => item.id === event.target.value); setTermId(event.target.value); setYearId(selected?.academic_year_id || yearId); setResult(null); }}><option value="">Choose a term</option>{terms.filter((term) => !yearId || term.academic_year_id === yearId).map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label>
      <p className="academic-helper">Required columns: <code>day_of_week, period, section, subject, faculty, room_code</code>. Period numbers and times come from this term&apos;s canonical period settings.</p>
      <label>CSV file<input type="file" accept=".csv,text/csv" onChange={handleFile} aria-label="Upload timetable CSV" /></label>
      {fileName && <p className="academic-helper">Loaded: {fileName} · {sourceRows.length} rows</p>}
      {error && <div className="academic-inline-error" role="alert">{error}</div>}
      {result && <div className={result.imported ? 'academic-import-result' : 'academic-inline-error'} role="status">{result.imported ? `${result.imported} classes imported; ${result.rejected} rows skipped. Completeness remains unchanged.` : `Nothing was imported. ${result.message}`}</div>}
    </div>
    {preview.length > 0 && <div className="academic-card"><div className="academic-heading-row"><div><p className="eyebrow">VALIDATION PREVIEW</p><h3>Review before importing</h3></div><button type="button" className="primary-button" onClick={confirmImport} disabled={!validRows.length || working}>{working ? 'Importing…' : `Import ${validRows.length} valid rows`}</button></div>
      <div className="academic-import-counts"><span>Total <b>{preview.length}</b></span><span>Ready <b>{counts['Ready to import'] || 0}</b></span><span>Invalid <b>{counts.Invalid || 0}</b></span><span>Duplicates <b>{counts.Duplicate || 0}</b></span><span>Conflicts <b>{counts.Conflicting || 0}</b></span><span>Unresolved <b>{counts['Requires resolution'] || 0}</b></span></div>
      {(preview.length !== validRows.length) && <p className="academic-helper">Only ready rows are imported. The database applies the whole selected batch atomically; if any database constraint rejects it, zero rows are saved.</p>}
      <div className="academic-import-table-wrap"><table className="academic-import-table"><thead><tr><th>Line</th><th>Day / period</th><th>Section</th><th>Subject</th><th>Faculty</th><th>Room</th><th>Status and details</th></tr></thead><tbody>{preview.map((row) => <tr key={row.line}><td>{row.line}</td><td>{days[row.day] || row.day_of_week} · {row.period?.display_name || row.period || row.period}</td>{[['section', 'sectionMatches'], ['subject', 'subjectMatches'], ['faculty', 'facultyMatches'], ['room', 'roomMatches']].map(([type, matchKey]) => <td key={type}>{row[matchKey].length > 1 ? <select aria-label={`Resolve ${type} on CSV line ${row.line}`} value={resolutions[`${row.line}:${type}`] || ''} onChange={(event) => setResolutions((current) => ({ ...current, [`${row.line}:${type}`]: event.target.value }))}><option value="">Choose {type}</option>{row[matchKey].map((item) => <option key={item.id} value={item.id}>{item.name || item.display_name || item.code} · {item.code || item.staff_identifier || item.department || item.id.slice(0, 8)}</option>)}</select> : row[type]?.name || row[type]?.display_name || row[type]?.code || row[`${type}_code`] || row[`${type}Label`]}</td>)}<td><strong>{row.status}</strong>{row.messages.map((message) => <small key={message}>{message}</small>)}</td></tr>)}</tbody></table></div>
    </div>}
  </div>;
}
