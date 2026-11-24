import React, { useState } from 'react';
import './CampusAvailability.css';
import { deriveRoomAvailability, isOperationallyAvailable } from '../domain/timetable';

const TODAY = new Date().toISOString().slice(0, 10);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isCompleteStatus = (status) => status === 'complete' || status === 'published';
const shortTime = (value) => String(value || '').slice(0, 5);

export default function CampusAvailability({ view, rooms, entries, academicData = {}, academicSchema = {}, onReserve, onViewChange }) {
  const [date, setDate] = useState(TODAY);
  const [periodNumber, setPeriodNumber] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [termIdInput, setTermIdInput] = useState('');
  const [notice, setNotice] = useState('');
  const years = academicData.years || [];
  const terms = academicData.terms || [];
  const sections = academicData.sections || [];
  const configuredPeriods = academicData.periods || [];
  const completeness = academicData.completeness || [];
  const initialTerm = terms.find((term) => term.status === 'active') || terms[0];
  const termId = termIdInput || initialTerm?.id || '';
  const term = terms.find((item) => item.id === termId) || null;
  const termPeriods = configuredPeriods
    .filter((period) => period.term_id === termId && period.is_active)
    .slice().sort((left, right) => Number(left.period_number) - Number(right.period_number));
  const termEntries = entries.filter((entry) => entry.term_id === termId && entry.is_active !== false);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const timetableDay = weekday === 0 ? 7 : weekday;
  const dayEntries = termEntries.filter((entry) => Number(entry.day_of_week) === timetableDay);
  const selectedEntries = dayEntries.filter((entry) => !periodNumber || Number(entry.period) === Number(periodNumber));
  const roomCategory = view === 'labs' ? 'laboratory' : 'classroom';
  const categorizedRooms = rooms.filter((room) => room.category === roomCategory);
  const unclassifiedCount = rooms.filter((room) => !room.category).length;
  const roomResults = deriveRoomAvailability(categorizedRooms, selectedEntries, { building, floor });
  const facultyIds = [...new Set(dayEntries.map((entry) => entry.faculty_id).filter(Boolean))].sort();
  const termSections = sections.filter((section) => section.term_id === termId && section.is_active);
  const validSectionId = termSections.some((section) => section.id === sectionId) ? sectionId : '';
  const selectedSection = termSections.find((section) => section.id === validSectionId) || null;
  const institutionStatus = completeness.find((item) => item.term_id === termId && item.scope_type === 'institution')?.status || 'not_configured';
  const sectionStatus = completeness.find((item) => item.term_id === termId && item.scope_type === 'section' && item.section_id === validSectionId)?.status || 'not_configured';
  const statusForScope = view === 'students' ? sectionStatus : institutionStatus;
  const scheduleComplete = isCompleteStatus(statusForScope);
  const dateInTerm = Boolean(term && date >= term.starts_on && date <= term.ends_on);
  const buildings = [...new Set(categorizedRooms.map((room) => room.building).filter(Boolean))].sort();
  const floors = [...new Set(categorizedRooms.filter((room) => !building || room.building === building).map((room) => room.floor))].sort((a, b) => a - b);
  const isRoomView = view === 'classrooms' || view === 'labs';
  const isFacultyView = view === 'faculty';
  const isStudentView = view === 'students';

  function completionNotice(scopeName) {
    return isCompleteStatus(statusForScope)
      ? `${scopeName} completeness is ${statusForScope}.`
      : `${scopeName} completeness is ${String(statusForScope).replaceAll('_', ' ')}. Empty periods remain unknown, not free.`;
  }

  if (!academicSchema.available) {
    return <section className="page-content campus-availability">
      <AvailabilityHeader view={view} onViewChange={onViewChange} />
      <div className="availability-empty" role="status"><strong>{academicSchema.schemaMissing ? 'Academic availability needs the academic database migration.' : 'Academic availability is not available.'}</strong><p>{academicSchema.error || 'No academic schedule has been loaded. Northstar will not infer that empty records mean free rooms or periods.'}</p></div>
    </section>;
  }

  return <section className="page-content campus-availability">
    <AvailabilityHeader view={view} onViewChange={onViewChange} />
    <div className="availability-filters">
      <label>Academic term<select value={termId} onChange={(event) => { setTermIdInput(event.target.value); setPeriodNumber(''); setSectionId(''); }}><option value="">Choose a term</option>{terms.map((item) => <option key={item.id} value={item.id}>{years.find((year) => year.id === item.academic_year_id)?.name || 'Academic year'} · {item.name}</option>)}</select></label>
      <label>Day<input type="date" value={date} min={term?.starts_on} max={term?.ends_on} onChange={(event) => setDate(event.target.value)} /></label>
      {(isRoomView || isFacultyView) && <label>Period<select value={periodNumber} onChange={(event) => setPeriodNumber(event.target.value)}><option value="">All periods</option>{termPeriods.map((period) => <option key={period.id} value={period.period_number}>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</option>)}</select></label>}
      {isRoomView && <><label>Block<select value={building} onChange={(event) => { setBuilding(event.target.value); setFloor(''); }}><option value="">All blocks</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select></label><label>Floor<select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">All floors</option>{floors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></>}
      {isFacultyView && <label>Faculty record<select value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="">Select faculty ID</option>{facultyIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>}
      {isStudentView && <label>Student section<select value={validSectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Select a section</option>{termSections.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.name}</option>)}</select></label>}
    </div>
    {!term ? <div className="availability-empty"><strong>No academic term is configured.</strong><p>An administrator must configure a year, term, and canonical periods before availability can be derived.</p></div> : <>
      <div className="availability-notice" role="status">{years.find((year) => year.id === term.academic_year_id)?.name} · {term.name} · {dateInTerm ? WEEKDAYS[weekday] : 'Selected day is outside this term'} · {completionNotice(isStudentView ? selectedSection?.name || 'Section' : 'Institution-wide timetable')}</div>
      {!dateInTerm && <div className="availability-empty"><strong>No timetable applies to this date.</strong><p>Choose a date inside {term.starts_on}–{term.ends_on}. Dates outside the selected term are not shown as free.</p></div>}
      {dateInTerm && !termPeriods.length && <div className="availability-empty"><strong>No canonical periods are configured.</strong><p>An administrator must configure the actual daily periods for this term.</p></div>}

      {isRoomView && dateInTerm && termPeriods.length > 0 && <>
        <div className="availability-notice">Showing {roomCategory === 'classroom' ? 'classrooms' : 'laboratories'} only. Academic assignments come from this term&apos;s central timetable; reservations remain separately governed by the booking workflow.{unclassifiedCount > 0 ? ` ${unclassifiedCount} room${unclassifiedCount === 1 ? ' is' : 's are'} unclassified and excluded.` : ''}</div>
        {!categorizedRooms.length ? <div className="availability-empty"><strong>No rooms are classified as {roomCategory === 'classroom' ? 'classrooms' : 'laboratories'}.</strong><p>Classify rooms in Room management. Northstar does not infer categories from room names.</p></div> : <div className="availability-list">{roomResults.map(({ room, occupied, assignments }) => {
          const operational = isOperationallyAvailable(room);
          const hasConfirmedVacancy = scheduleComplete && !occupied && operational;
          return <article className="availability-room" key={room.id}><div className="availability-room-main"><span className={`availability-indicator ${occupied || !operational || !scheduleComplete ? 'busy' : ''}`} /><div><strong>{room.code} · {room.name}</strong><p>{room.building} · Floor {room.floor} · {room.capacity} seats</p>{occupied ? <small>{assignments.map((entry) => `Period ${entry.period}: ${entry.subject} · ${entry.faculty_id}`).join(' / ')}</small> : <small>{scheduleComplete ? 'No class assignment in the complete timetable' : 'No assignment recorded; schedule completeness is not confirmed'}</small>}</div></div><div className="availability-room-action"><span>{occupied ? 'Scheduled' : !operational ? 'Operational restriction' : hasConfirmedVacancy ? 'Academic vacancy' : 'Unknown'}</span>{hasConfirmedVacancy && <button className="secondary-button" onClick={() => { setNotice('Academic vacancy is confirmed for this timetable scope. The booking workspace still performs the authoritative reservation and closure checks.'); onReserve(room, date); }}>Continue to booking</button>}</div></article>;
        })}</div>}
      </>}

      {isFacultyView && dateInTerm && termPeriods.length > 0 && <>
        {!facultyId ? <div className="availability-empty"><strong>Select a faculty record.</strong><p>Faculty options are drawn from the selected term&apos;s timetable. Faculty profile details remain administrator-only.</p></div> : <div className="availability-list">{termPeriods.filter((period) => !periodNumber || Number(period.period_number) === Number(periodNumber)).map((period) => {
          const entry = dayEntries.find((item) => item.faculty_id === facultyId && Number(item.period) === Number(period.period_number));
          const room = entry && rooms.find((item) => item.id === entry.room_id);
          return <article className="availability-room" key={period.id}><div><strong>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</strong><p>{entry ? `${entry.subject} · ${room?.code || 'Room'}` : scheduleComplete ? 'No assignment in the complete timetable' : 'No assignment recorded'}</p></div><span className={entry ? 'occupied-text' : 'row-status'}>{entry ? 'Scheduled' : scheduleComplete ? 'Timetable-free' : 'Unknown'}</span></article>;
        })}</div>}
      </>}

      {isStudentView && dateInTerm && termPeriods.length > 0 && <>
        {!selectedSection ? <div className="availability-empty"><strong>Select a student section.</strong><p>Section availability is based on its own explicitly declared completeness status, not just existing class rows.</p></div> : <div className="availability-list">{termPeriods.map((period) => {
          const entry = dayEntries.find((item) => item.section_id === selectedSection.id && Number(item.period) === Number(period.period_number));
          const room = entry && rooms.find((item) => item.id === entry.room_id);
          return <article className="availability-room" key={period.id}><div><strong>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</strong><p>{entry ? `${entry.subject} · ${room?.code || 'Room'}` : scheduleComplete ? 'No class assigned to this section' : 'No assignment recorded'}</p></div><span className={entry ? 'occupied-text' : 'row-status'}>{entry ? 'Scheduled' : scheduleComplete ? 'Section-free' : 'Unknown'}</span></article>;
        })}</div>}
      </>}
    </>}
    {notice && <p className="availability-notice" role="status">{notice}</p>}
  </section>;
}

function AvailabilityHeader({ view, onViewChange }) {
  const isRoomView = view === 'classrooms';
  const isFacultyView = view === 'faculty';
  return <>
    <div className="page-intro"><div><p className="eyebrow">CAMPUS AVAILABILITY / TIMETABLE INTELLIGENCE</p><h2>{isRoomView ? 'Find an academically free classroom.' : isFacultyView ? 'See faculty schedules.' : view === 'labs' ? 'Laboratory availability.' : 'Student section free time.'}</h2><p>Academic schedules are term-specific. Empty assignments are treated as unknown until an administrator confirms timetable completeness.</p></div></div>
    <div className="availability-tabs" aria-label="Campus availability views">
      {[[ 'classrooms', 'Classrooms' ], [ 'labs', 'Laboratories' ], [ 'faculty', 'Faculty' ], [ 'students', 'Student free time' ]].map(([key, label]) => <button key={key} type="button" className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => onViewChange(key)}>{label}</button>)}
    </div>
  </>;
}
