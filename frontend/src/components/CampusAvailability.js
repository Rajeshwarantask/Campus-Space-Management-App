import React, { useMemo, useState } from 'react';
import './CampusAvailability.css';
import { deriveAcademicStatus, derivePeriodAvailability, isOperationallyAvailable } from '../domain/timetable';

const TODAY = new Date().toISOString().slice(0, 10);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const complete = (status) => ['complete', 'published'].includes(status);
const shortTime = (value) => String(value || '').slice(0, 5);

export default function CampusAvailability({ view, rooms = [], entries = [], academicData = {}, academicSchema = {}, timetableLoading = false, timetableSelection, onScheduleQuery, onReserve, onViewChange }) {
  const [date, setDate] = useState(TODAY);
  const [periodNumber, setPeriodNumber] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [yearIdInput, setYearIdInput] = useState('');
  const [termIdInput, setTermIdInput] = useState('');
  const [notice, setNotice] = useState('');
  const years = academicData.years || [];
  const terms = academicData.terms || [];
  const selectedYearId = yearIdInput || terms.find((item) => item.id === termIdInput)?.academic_year_id || years.find((item) => item.status === 'active')?.id || years[0]?.id || '';
  const yearTerms = terms.filter((item) => !selectedYearId || item.academic_year_id === selectedYearId);
  const initialTerm = yearTerms.find((item) => item.status === 'active') || yearTerms[0];
  const termId = yearTerms.some((item) => item.id === termIdInput) ? termIdInput : initialTerm?.id || '';
  const term = terms.find((item) => item.id === termId) || null;
  const periods = (academicData.periods || []).filter((item) => item.term_id === termId && item.is_active).slice().sort((a, b) => Number(a.period_number) - Number(b.period_number));
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const timetableDay = weekday === 0 ? 7 : weekday;
  const queryMatches = timetableSelection ? timetableSelection.termId === termId && Number(timetableSelection.dayOfWeek) === timetableDay : !onScheduleQuery;
  const scheduleUnavailable = timetableLoading || !queryMatches || Boolean(academicSchema.timetableError || academicSchema.academicDataError || academicSchema.roomDataError);
  const requestSchedule = (nextTermId, nextDate = date) => {
    if (!nextTermId || !onScheduleQuery) return;
    const nextWeekday = new Date(`${nextDate}T12:00:00`).getDay() || 7;
    onScheduleQuery(nextTermId, nextWeekday);
  };
  const dayEntries = useMemo(() => queryMatches ? entries.filter((entry) => entry.term_id === termId && entry.is_active !== false && Number(entry.day_of_week) === timetableDay) : [], [queryMatches, entries, termId, timetableDay]);
  const completeness = academicData.completeness || [];
  const institutionStatus = completeness.find((item) => item.term_id === termId && item.scope_type === 'institution')?.status;
  const termSections = (academicData.sections || []).filter((item) => item.term_id === termId && item.is_active);
  const selectedSection = termSections.find((item) => item.id === sectionId) || null;
  const sectionStatus = completeness.find((item) => item.term_id === termId && item.scope_type === 'section' && item.section_id === selectedSection?.id)?.status;
  const dateInTerm = Boolean(term && date >= term.starts_on && date <= term.ends_on);
  const roomView = view === 'classrooms' || view === 'labs';
  const facultyView = view === 'faculty';
  const studentView = view === 'students';
  const roomCategory = view === 'labs' ? 'laboratory' : 'classroom';
  const categorizedRooms = rooms.filter((room) => room.category === roomCategory);
  const filteredPeriods = periods.filter((period) => !periodNumber || Number(period.period_number) === Number(periodNumber));
  const selectedScopeStatus = studentView ? sectionStatus : institutionStatus;
  const facultyProfiles = academicData.facultyProfiles || [];
  const visibleFaculty = facultyProfiles.length ? facultyProfiles : [...new Map(dayEntries.filter((entry) => entry.faculty_id).map((entry) => [entry.faculty_id, { id: entry.faculty_id, display_name: entry.faculty_id }])).values()];
  const roomRows = useMemo(() => categorizedRooms.filter((room) => (!building || room.building === building) && (!floor || String(room.floor) === String(floor))).map((room) => {
    const rows = derivePeriodAvailability(filteredPeriods, dayEntries, { scopeStatus: institutionStatus, matches: (entry) => entry.room_id === room.id });
    const assignments = rows.flatMap((row) => row.assignments);
    const status = deriveAcademicStatus(assignments, institutionStatus);
    return { room, status, assignments };
  }), [categorizedRooms, building, floor, filteredPeriods, dayEntries, institutionStatus]);
  const buildings = [...new Set(categorizedRooms.map((room) => room.building).filter(Boolean))].sort();
  const floors = [...new Set(categorizedRooms.filter((room) => !building || room.building === building).map((room) => room.floor))].sort((a, b) => Number(a) - Number(b));

  if (!academicSchema.available) return <section className="page-content campus-availability"><AvailabilityHeader view={view} onViewChange={onViewChange} /><div className="availability-empty" role="status"><strong>{academicSchema.schemaMissing ? 'Academic availability needs the academic database migration.' : 'Academic availability is not available.'}</strong><p>{academicSchema.error || 'Academic schedule data could not be loaded. Empty records are never treated as proof of availability.'}</p></div></section>;

  return <section className="page-content campus-availability">
    <AvailabilityHeader view={view} onViewChange={onViewChange} />
    <div className="availability-filters">
      <label>Academic year<select value={selectedYearId} onChange={(event) => { const nextYearId = event.target.value; const options = terms.filter((item) => item.academic_year_id === nextYearId); const nextTerm = options.find((item) => item.status === 'active') || options[0]; setYearIdInput(nextYearId); setTermIdInput(''); setPeriodNumber(''); setSectionId(''); requestSchedule(nextTerm?.id); }}><option value="">Choose a year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
      <label>Term<select value={termId} onChange={(event) => { setTermIdInput(event.target.value); setPeriodNumber(''); setSectionId(''); requestSchedule(event.target.value); }}><option value="">Choose a term</option>{yearTerms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Day<input type="date" value={date} min={term?.starts_on} max={term?.ends_on} onChange={(event) => { setDate(event.target.value); requestSchedule(termId, event.target.value); }} /></label>
      {(roomView || facultyView) && <label>Period<select value={periodNumber} onChange={(event) => setPeriodNumber(event.target.value)}><option value="">All periods</option>{periods.map((period) => <option key={period.id} value={period.period_number}>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</option>)}</select></label>}
      {roomView && <><label>Building<select value={building} onChange={(event) => { setBuilding(event.target.value); setFloor(''); }}><option value="">All buildings</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select></label><label>Floor<select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">All floors</option>{floors.map((item) => <option key={String(item)} value={item}>{item}</option>)}</select></label></>}
      {facultyView && <label>Faculty member<select value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="">Select faculty</option>{visibleFaculty.map((item) => <option key={item.id} value={item.id}>{item.display_name}{item.staff_identifier ? ` · ${item.staff_identifier}` : ''}</option>)}</select></label>}
      {studentView && <label>Student section<select value={selectedSection?.id || ''} onChange={(event) => setSectionId(event.target.value)}><option value="">Select a section</option>{termSections.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>}
    </div>
    {timetableLoading && <div className="availability-empty" role="status"><strong>Loading selected timetable…</strong><p>Results from another term or day are not shown while this schedule loads.</p></div>}
    {!timetableLoading && !queryMatches && !academicSchema.timetableError && !academicSchema.academicDataError && !academicSchema.roomDataError && <div className="availability-empty" role="status"><strong>Timetable selection is not loaded.</strong><p>Choose a term and day to load the matching academic schedule.</p></div>}
    {academicSchema.timetableError && <div className="availability-empty" role="alert"><strong>Timetable assignments could not be loaded.</strong><p>{academicSchema.timetableError} Availability is not calculated from a failed query.</p></div>}
    {academicSchema.academicDataError && <div className="availability-empty" role="alert"><strong>Academic reference data could not be loaded.</strong><p>{academicSchema.academicDataError} Missing references are not interpreted as free.</p></div>}
    {academicSchema.roomDataError && <div className="availability-empty" role="alert"><strong>Room records could not be loaded.</strong><p>{academicSchema.roomDataError}</p></div>}
    {!term ? <Empty title="No academic term is configured." text="An administrator must configure a year and term before availability can be derived." /> : <>
      <div className="availability-notice" role="status">{years.find((item) => item.id === term.academic_year_id)?.name} · {term.name} · {dateInTerm ? WEEKDAYS[weekday] : 'Selected day is outside this term'} · {scopeLabel(selectedScopeStatus)}</div>
      {!dateInTerm ? <Empty title="No timetable applies to this date." text={`Choose a date inside ${term.starts_on}–${term.ends_on}. Dates outside this term are not shown as free.`} /> : !periods.length ? <Empty title="No canonical periods are configured." text="Configure actual period start and end times for this term." /> : null}
      {roomView && dateInTerm && periods.length > 0 && !scheduleUnavailable && <>
        <div className="availability-notice">Academic timetable status is separate from operational status and reservations. Only {roomCategory === 'classroom' ? 'classrooms' : 'laboratories'} are listed; unclassified rooms are excluded.</div>
        {!categorizedRooms.length ? <Empty title={`No rooms are classified as ${roomCategory === 'classroom' ? 'classrooms' : 'laboratories'}.`} text="Classify rooms in Room management; Northstar does not infer categories." /> : <div className="availability-list">{roomRows.map(({ room, status, assignments }) => {
          const operational = isOperationallyAvailable(room);
          const assignmentInfo = assignments.map((entry) => `${entry.subject || 'Subject'} · ${termSections.find((section) => section.id === entry.section_id)?.code || 'Section'} · ${facultyProfiles.find((person) => person.id === entry.faculty_id)?.display_name || entry.faculty_id || 'Faculty'}`).join(' / ');
          const canContinue = status === 'available' && operational;
          return <article className="availability-room" key={room.id}><div className="availability-room-main"><span className={`availability-indicator ${status !== 'available' || !operational ? 'busy' : ''}`} /><div><strong>{room.code} · {room.name}</strong><p>{room.building || 'Building not set'} · Floor {room.floor ?? '—'} · {room.capacity ?? '—'} seats · {roomCategory}</p><small>{status === 'occupied' ? assignmentInfo : status === 'available' ? 'No class assignment in a complete timetable' : 'No assignment recorded; timetable completeness is not confirmed'}</small></div></div><div className="availability-room-action"><span>{status === 'occupied' ? 'Occupied' : status === 'available' ? 'Academic availability: free' : 'Academic availability: unknown'}<br />Operational: {operational ? 'available' : room.operational_status || 'inactive'}</span>{canContinue && <button className="secondary-button" onClick={() => { setNotice('Academic vacancy is not reservation confirmation. The booking system checks the requested interval, closures, and eligibility.'); onReserve(room, date); }}>Continue to booking</button>}</div></article>;
        })}</div>}
      </>}
      {facultyView && dateInTerm && periods.length > 0 && !scheduleUnavailable && (!facultyId ? <Empty title="Select a faculty member." text={facultyProfiles.length ? 'Faculty records are from the academic directory.' : 'Faculty directory records are unavailable; assignments alone cannot enumerate unassigned faculty.'} /> : <div className="availability-list">{derivePeriodAvailability(filteredPeriods, dayEntries, { scopeStatus: institutionStatus, matches: (entry) => entry.faculty_id === facultyId }).map(({ period, entry, status }) => <ScheduleRow key={period.id} period={period} status={status} detail={entry ? `${entry.subject || 'Subject'} · ${termSections.find((section) => section.id === entry.section_id)?.code || 'Section'} · ${rooms.find((room) => room.id === entry.room_id)?.code || 'Room not recorded'}` : ''} emptyText="No faculty assignment in this complete institutional timetable" />)}</div>)}
      {studentView && dateInTerm && periods.length > 0 && !scheduleUnavailable && (!selectedSection ? <Empty title="Select a student section." text="Section free periods require that section's own completeness scope." /> : <div className="availability-list">{derivePeriodAvailability(periods, dayEntries, { scopeStatus: sectionStatus, matches: (entry) => entry.section_id === selectedSection.id }).map(({ period, entry, status }) => <ScheduleRow key={period.id} period={period} status={status} detail={entry ? `${entry.subject || 'Subject'} · ${facultyProfiles.find((person) => person.id === entry.faculty_id)?.display_name || entry.faculty_id || 'Faculty'} · ${rooms.find((room) => room.id === entry.room_id)?.code || 'Room not recorded'}` : ''} emptyText="No class assigned to this section in its complete timetable" />)}</div>)}
    </>}
    {notice && <p className="availability-notice" role="status">{notice}</p>}
  </section>;
}

function scopeLabel(status) { return complete(status) ? `Timetable completeness: ${status}` : `Timetable completeness: ${String(status || 'missing').replaceAll('_', ' ')}. Empty periods are unknown.`; }
function Empty({ title, text }) { return <div className="availability-empty"><strong>{title}</strong><p>{text}</p></div>; }
function ScheduleRow({ period, status, detail, emptyText }) { return <article className="availability-room"><div><strong>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</strong><p>{status === 'occupied' ? detail : status === 'available' ? emptyText : 'No assignment recorded; completeness is not confirmed'}</p></div><span className={status === 'occupied' ? 'occupied-text' : 'row-status'}>{status === 'occupied' ? 'Occupied' : status === 'available' ? 'Free' : 'Unknown'}</span></article>; }
function AvailabilityHeader({ view, onViewChange }) {
  const title = view === 'classrooms' ? 'Find an academically free classroom.' : view === 'faculty' ? 'See faculty schedules.' : view === 'labs' ? 'Laboratory availability.' : 'Student section free time.';
  return <><div className="page-intro"><div><p className="eyebrow">CAMPUS AVAILABILITY / TIMETABLE INTELLIGENCE</p><h2>{title}</h2><p>Academic availability is derived from canonical timetable periods and explicit completeness scopes; it does not confirm a reservation.</p></div></div><div className="availability-tabs" aria-label="Campus availability views">{[['classrooms', 'Classrooms'], ['labs', 'Laboratories'], ['faculty', 'Faculty'], ['students', 'Student free time']].map(([key, label]) => <button key={key} type="button" className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => onViewChange(key)}>{label}</button>)}</div></>;
}
