import React, { useMemo, useState } from 'react';
import './CampusAvailability.css';
import { deriveRoomAvailability, deriveFacultyPeriods, getAcademicPeriods, isOperationallyAvailable } from '../domain/timetable';

const TODAY = new Date().toISOString().slice(0, 10);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CampusAvailability({ view, rooms, entries, onReserve, onViewChange }) {
  const [date, setDate] = useState(TODAY);
  const [periodNumber, setPeriodNumber] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [notice, setNotice] = useState('');
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const periods = useMemo(() => getAcademicPeriods(entries), [entries]);
  const timetableDay = weekday === 0 ? 7 : weekday;
  const applicable = entries.filter((entry) => Number(entry.day_of_week) === timetableDay);
  const selectedEntries = applicable.filter((entry) => !periodNumber || Number(entry.period) === Number(periodNumber));
  const roomResults = deriveRoomAvailability(rooms, selectedEntries, { building, floor });
  const facultyIds = [...new Set(entries.map((entry) => entry.faculty_id).filter(Boolean))].sort();
  const facultyPeriods = deriveFacultyPeriods(facultyId, applicable, periods);
  const buildings = [...new Set(rooms.map((room) => room.building).filter(Boolean))].sort();
  const floors = [...new Set(rooms.filter((room) => !building || room.building === building).map((room) => room.floor))].sort((a, b) => a - b);
  const isRoomView = view === 'classrooms';
  const isFacultyView = view === 'faculty';

  return <section className="page-content campus-availability">
    <div className="page-intro"><div><p className="eyebrow">CAMPUS AVAILABILITY / TIMETABLE INTELLIGENCE</p><h2>{isRoomView ? 'Find an academically free room.' : isFacultyView ? 'See faculty schedules.' : view === 'labs' ? 'Laboratory availability.' : 'Student free time.'}</h2><p>Timetable assignments provide academic context. Reservation availability is checked separately by the existing booking system.</p></div></div>
    <div className="availability-tabs" aria-label="Campus availability views">
      {[['classrooms', 'Classrooms'], ['labs', 'Laboratories'], ['faculty', 'Faculty'], ['students', 'Student free time']].map(([key, label]) => <button key={key} type="button" className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => onViewChange(key)}>{label}</button>)}
    </div>
    {(isRoomView || isFacultyView) && <div className="availability-filters">
      <label>Day<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      {isRoomView && <><label>Period<select value={periodNumber} onChange={(event) => setPeriodNumber(event.target.value)}><option value="">All periods</option>{periods.map((period) => <option key={period.index} value={period.index}>Period {period.index} · {period.start}–{period.end}</option>)}</select></label><label>Block<select value={building} onChange={(event) => { setBuilding(event.target.value); setFloor(''); }}><option value="">All blocks</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select></label><label>Floor<select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">All floors</option>{floors.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></>}
      {isFacultyView && <label>Faculty record<select value={facultyId} onChange={(event) => setFacultyId(event.target.value)}><option value="">Select faculty ID</option>{facultyIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>}
    </div>}
    {isRoomView && <><div className="availability-notice" role="status">{WEEKDAYS[weekday]} · Academic vacancy is derived from timetable assignments only. A missing class assignment is not proof that the timetable is complete or that a room is bookable.</div>{!entries.length ? <div className="availability-empty"><strong>No timetable assignments are available.</strong><p>Room inventory is present, but the timetable has no records to establish academic availability. No rooms are labeled free.</p></div> : <div className="availability-list">{roomResults.map(({ room, occupied, assignments }) => {
      const operational = isOperationallyAvailable(room);
      return <article className="availability-room" key={room.id}><div className="availability-room-main"><span className={`availability-indicator ${occupied || !operational ? 'busy' : ''}`} /><div><strong>{room.code} · {room.name}</strong><p>{room.building} · Floor {room.floor} · {room.capacity} seats</p>{occupied ? <small>{assignments.map((entry) => `Period ${entry.period}: ${entry.subject} · ${entry.faculty_id}`).join(' / ')}</small> : <small>No matching room assignment in the timetable</small>}</div></div><div className="availability-room-action"><span>{occupied ? 'Scheduled' : !operational ? 'Operational restriction' : 'Academic vacancy'}</span>{!occupied && operational && <button className="secondary-button" onClick={() => { setNotice('The booking workspace performs the authoritative reservation, closure and operational availability check. Re-select the desired date and time there.'); onReserve(room, date); }}>Continue to booking</button>}</div></article>;
    })}</div>}{notice && <p className="availability-notice" role="status">{notice}</p>}</>}
    {isFacultyView && <>{!facultyId ? <div className="availability-empty"><strong>Select a faculty record.</strong><p>Faculty options are drawn from IDs assigned in the timetable. The schema does not currently expose a faculty directory or names.</p></div> : <div className="availability-list">{facultyPeriods.map(({ period, entry }) => <article className="availability-room" key={period.index}><div><strong>Period {period.index} · {period.start}–{period.end}</strong><p>{entry ? `${entry.subject} · ${entry.room_id}` : 'No assignment recorded'}</p></div><span className={entry ? 'occupied-text' : 'row-status'}>{entry ? 'Scheduled' : 'Timetable-free'}</span></article>)}</div>}<p className="availability-notice">A period without a faculty assignment is timetable-free only; completeness of the timetable is not established.</p></>}
    {view === 'labs' && <div className="availability-empty"><strong>Laboratory classification is not available.</strong><p>The room inventory has no category or laboratory metadata. Northstar will not guess from room names; add authoritative room categories before showing lab-specific results.</p></div>}
    {view === 'students' && <div className="availability-empty"><strong>Section free-time view is not supported by the current schema.</strong><p>Timetable entries have no academic-year or section relationship, so student free periods cannot be derived reliably.</p></div>}
  </section>;
}
