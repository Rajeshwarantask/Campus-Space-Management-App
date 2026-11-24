import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CampusAvailability.css';
import { derivePeriodAvailability, isOperationallyAvailable } from '../domain/timetable';
import { academicRoomStatus, campusLocalToUtc, resolvePeriodRange } from '../domain/roomAvailability';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayForDate = (value) => new Date(`${value}T12:00:00Z`).getUTCDay();
const complete = (status) => ['complete', 'published'].includes(status);
const shortTime = (value) => String(value || '').slice(0, 5);

export default function CampusAvailability({ view, rooms = [], entries = [], academicData = {}, academicSchema = {}, timetableLoading = false, timetableSelection, timeZone = 'Asia/Kolkata', onScheduleQuery, onReservationSearch, onReserve, onViewChange }) {
  const initialYear = (academicData.years || []).find((item) => item.status === 'active') || (academicData.years || [])[0];
  const initialAvailabilityTerm = (academicData.terms || []).find((item) => item.academic_year_id === initialYear?.id && item.status === 'active') || (academicData.terms || []).find((item) => item.academic_year_id === initialYear?.id);
  const firstPeriod = (academicData.periods || []).filter((item) => item.is_active && item.term_id === initialAvailabilityTerm?.id).slice().sort((a, b) => Number(a.period_number) - Number(b.period_number))[0]?.period_number;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [date, setDate] = useState(today);
  const [periodNumber, setPeriodNumber] = useState('');
  const [startPeriodNumber, setStartPeriodNumber] = useState(firstPeriod ? String(firstPeriod) : '');
  const [endPeriodNumber, setEndPeriodNumber] = useState(firstPeriod ? String(firstPeriod) : '');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [category, setCategory] = useState(view === 'labs' ? 'laboratory' : 'classroom');
  const [minimumCapacity, setMinimumCapacity] = useState('');
  const [equipment, setEquipment] = useState('');
  const [reservationResults, setReservationResults] = useState(null);
  const [reservationLoading, setReservationLoading] = useState(false);
  const [reservationError, setReservationError] = useState('');
  const reservationRequest = useRef(0);
  const [facultyId, setFacultyId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [yearIdInput, setYearIdInput] = useState('');
  const [termIdInput, setTermIdInput] = useState('');
  const years = academicData.years || [];
  const terms = academicData.terms || [];
  const selectedYearId = yearIdInput || terms.find((item) => item.id === termIdInput)?.academic_year_id || years.find((item) => item.status === 'active')?.id || years[0]?.id || '';
  const yearTerms = terms.filter((item) => !selectedYearId || item.academic_year_id === selectedYearId);
  const initialTerm = yearTerms.find((item) => item.status === 'active') || yearTerms[0];
  const termId = yearTerms.some((item) => item.id === termIdInput) ? termIdInput : initialTerm?.id || '';
  const term = terms.find((item) => item.id === termId) || null;
  const periods = (academicData.periods || []).filter((item) => item.term_id === termId && item.is_active).slice().sort((a, b) => Number(a.period_number) - Number(b.period_number));
  const weekday = weekdayForDate(date);
  const timetableDay = weekday === 0 ? 7 : weekday;
  const queryMatches = timetableSelection ? timetableSelection.termId === termId && Number(timetableSelection.dayOfWeek) === timetableDay : !onScheduleQuery;
  const scheduleUnavailable = timetableLoading || !queryMatches || Boolean(academicSchema.timetableError || academicSchema.academicDataError || academicSchema.roomDataError);
  const requestSchedule = (nextTermId, nextDate = date) => {
    if (!nextTermId || !onScheduleQuery) return;
    const nextWeekday = weekdayForDate(nextDate) || 7;
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
  const roomCategory = category;
  const categorizedRooms = useMemo(() => rooms.filter((room) => room.is_active !== false && room.operational_status !== 'retired' && (roomCategory === 'all' || (roomCategory === 'unclassified' ? !room.category : room.category === roomCategory))), [rooms, roomCategory]);
  const filteredPeriods = periods.filter((period) => !periodNumber || Number(period.period_number) === Number(periodNumber));
  const interval = resolvePeriodRange(periods, startPeriodNumber, endPeriodNumber);
  const intervalStart = interval?.start;
  const intervalEnd = interval?.end;
  const resolvedStart = interval && campusLocalToUtc(date, intervalStart, timeZone);
  const resolvedEnd = interval && campusLocalToUtc(date, intervalEnd, timeZone);
  const requestedStart = resolvedStart?.toISOString() || '';
  const requestedEnd = resolvedEnd?.toISOString() || '';
  const intervalValid = Boolean(dateInTerm && resolvedStart && resolvedEnd && resolvedEnd > resolvedStart);
  const selectedScopeStatus = studentView ? sectionStatus : institutionStatus;
  const facultyProfiles = academicData.facultyProfiles || [];
  const visibleFaculty = facultyProfiles.length ? facultyProfiles : [...new Map(dayEntries.filter((entry) => entry.faculty_id).map((entry) => [entry.faculty_id, { id: entry.faculty_id, display_name: entry.faculty_id }])).values()];
  const roomRows = useMemo(() => categorizedRooms.filter((room) => (!building || room.building === building) && (!floor || String(room.floor) === String(floor)) && (!minimumCapacity || Number(room.capacity) >= Number(minimumCapacity)) && (!equipment || (room.equipment || []).includes(equipment))).map((room) => {
    const result = intervalStart && intervalEnd ? academicRoomStatus(room.id, intervalStart, intervalEnd, dayEntries, institutionStatus) : { status: 'unknown', assignments: [] };
    return { room, status: result.status, assignments: result.assignments };
  }), [categorizedRooms, building, floor, minimumCapacity, equipment, intervalStart, intervalEnd, dayEntries, institutionStatus]);
  const buildings = [...new Set(categorizedRooms.map((room) => room.building).filter(Boolean))].sort();
  const floors = [...new Set(categorizedRooms.filter((room) => !building || room.building === building).map((room) => room.floor).filter((value) => value !== null && value !== undefined))].sort((a, b) => Number(a) - Number(b));
  const equipmentOptions = [...new Set(categorizedRooms.flatMap((room) => room.equipment || []))].sort();
  const reservationOptions = useMemo(() => ({ building: building || null, minCapacity: Number(minimumCapacity) || 0, equipment: equipment || null }), [building, minimumCapacity, equipment]);
  useEffect(() => setCategory(view === 'labs' ? 'laboratory' : 'classroom'), [view]);
  useEffect(() => {
    const requestId = ++reservationRequest.current;
    setReservationResults(null);
    setReservationError('');
    if (!roomView || !intervalValid || !onReservationSearch || scheduleUnavailable || !roomRows.length) { setReservationLoading(false); return undefined; }
    setReservationLoading(true);
    Promise.resolve().then(() => onReservationSearch(requestedStart, requestedEnd, reservationOptions)).then((result) => {
      if (requestId !== reservationRequest.current) return;
      if (result?.error) setReservationError(result.error);
      else setReservationResults(Object.fromEntries((result?.data || []).map((row) => [row.room_id, row])));
      setReservationLoading(false);
    }).catch(() => {
      if (requestId !== reservationRequest.current) return;
      setReservationError('Reservation availability could not be loaded.');
      setReservationLoading(false);
    });
    return () => { reservationRequest.current += 1; };
  }, [roomView, intervalValid, requestedStart, requestedEnd, onReservationSearch, scheduleUnavailable, reservationOptions, roomRows]);

  if (!academicSchema.available) return <section className="page-content campus-availability"><AvailabilityHeader view={view} onViewChange={onViewChange} /><div className="availability-empty" role="status"><strong>{academicSchema.schemaMissing ? 'Academic availability needs the academic database migration.' : 'Academic availability is not available.'}</strong><p>{academicSchema.error || 'Academic schedule data could not be loaded. Empty records are never treated as proof of availability.'}</p></div></section>;

  return <section className="page-content campus-availability">
    <AvailabilityHeader view={view} onViewChange={onViewChange} />
    <div className="availability-filters">
      <label>Academic year<select value={selectedYearId} onChange={(event) => { const nextYearId = event.target.value; const options = terms.filter((item) => item.academic_year_id === nextYearId); const nextTerm = options.find((item) => item.status === 'active') || options[0]; setYearIdInput(nextYearId); setTermIdInput(''); setPeriodNumber(''); setSectionId(''); requestSchedule(nextTerm?.id); }}><option value="">Choose a year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
      <label>Term<select value={termId} onChange={(event) => { setTermIdInput(event.target.value); setPeriodNumber(''); setSectionId(''); requestSchedule(event.target.value); }}><option value="">Choose a term</option>{yearTerms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Day<input type="date" value={date} min={term?.starts_on} max={term?.ends_on} onChange={(event) => { setDate(event.target.value); requestSchedule(termId, event.target.value); }} /></label>
      {roomView && <><label>Start period<select aria-label="Start period" value={startPeriodNumber} onChange={(event) => { setStartPeriodNumber(event.target.value); if (!endPeriodNumber || Number(event.target.value) > Number(endPeriodNumber)) setEndPeriodNumber(event.target.value); }}><option value="">Choose start</option>{periods.map((period) => <option key={period.id} value={period.period_number}>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</option>)}</select></label><label>End period<select aria-label="End period" value={endPeriodNumber} onChange={(event) => setEndPeriodNumber(event.target.value)}><option value="">Choose end</option>{periods.map((period) => <option key={period.id} value={period.period_number}>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</option>)}</select></label></>}
      {facultyView && <label>Period<select value={periodNumber} onChange={(event) => setPeriodNumber(event.target.value)}><option value="">All periods</option>{periods.map((period) => <option key={period.id} value={period.period_number}>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</option>)}</select></label>}
      {roomView && <><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option><option value="classroom">Classroom</option><option value="laboratory">Laboratory</option><option value="unclassified">Unclassified</option></select></label><label>Building<select value={building} onChange={(event) => { setBuilding(event.target.value); setFloor(''); }}><option value="">All buildings</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select></label><label>Floor<select value={floor} onChange={(event) => setFloor(event.target.value)}><option value="">All floors</option>{floors.map((item) => <option key={String(item)} value={item}>{item}</option>)}</select></label><label>Minimum capacity<input type="number" min="0" value={minimumCapacity} onChange={(event) => setMinimumCapacity(event.target.value)} /></label><label>Equipment<select value={equipment} onChange={(event) => setEquipment(event.target.value)}><option value="">Any equipment</option>{equipmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button type="button" className="secondary-button" onClick={() => { setStartPeriodNumber(''); setEndPeriodNumber(''); setCategory(view === 'labs' ? 'laboratory' : 'classroom'); setBuilding(''); setFloor(''); setMinimumCapacity(''); setEquipment(''); }}>Clear filters</button></>}
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
      {roomView && dateInTerm && periods.length > 0 && <>
        <div className="availability-notice">Academic, operational and reservation availability are evaluated separately. The database availability search is authoritative; a search result never guarantees a booking.</div>
        {interval && <div className="availability-notice" role="status">Requested interval: {interval.start.slice(0, 5)}–{interval.end.slice(0, 5)} · {date}{!intervalValid ? ' · Invalid interval or date' : ''}</div>}
        {!interval && <Empty title="Choose a valid start and end period." text="Both periods must belong to the selected term, and the start period cannot follow the end period." />}
        {scheduleUnavailable ? <Empty title="Timetable is not ready for this selection." text="Results from another term or date are not used." /> : reservationLoading ? <div className="availability-empty" role="status"><strong>Checking reservation availability…</strong><p>Previous results are cleared while the selected interval and filters are checked.</p></div> : reservationError ? <div className="availability-empty" role="alert"><strong>Reservation availability could not be loaded.</strong><p>{reservationError}</p></div> : null}
        {intervalValid && !scheduleUnavailable && !reservationLoading && !reservationError && !categorizedRooms.length ? <Empty title="No active rooms match these filters." text="Unclassified rooms can be included explicitly using the Category filter." /> : intervalValid && !scheduleUnavailable && !reservationLoading && !reservationError && <div className="availability-list">{roomRows.map(({ room, status, assignments }) => {
          const operational = isOperationallyAvailable(room);
          const reservation = reservationResults?.[room.id];
          const reservationAvailable = reservation?.availability_status === 'available';
          const assignmentInfo = assignments.map((entry) => `${entry.subject || 'Subject'} · ${termSections.find((section) => section.id === entry.section_id)?.code || 'Section'} · ${facultyProfiles.find((person) => person.id === entry.faculty_id)?.display_name || entry.faculty_id || 'Faculty'}`).join(' / ');
          const canContinue = status === 'available' && operational && reservationAvailable;
          const categoryLabel = room.category || 'Unclassified';
          const reason = reservation?.reason ? String(reservation.reason).replaceAll('_', ' ') : '';
          return <article className="availability-room" key={room.id}><div className="availability-room-main"><span className={`availability-indicator ${status !== 'available' || !operational || !reservationAvailable ? 'busy' : ''}`} /><div><strong>{room.code} · {room.name}</strong><p>{room.building || 'Building not set'} · Floor {room.floor ?? '—'} · {room.capacity ?? '—'} seats · {categoryLabel}</p><small>{room.equipment?.length ? `Equipment: ${room.equipment.join(', ')}` : 'No equipment listed'}{status === 'occupied' ? ` · ${assignmentInfo}` : status === 'available' ? ' · No timetable assignment in the complete institutional scope' : ' · Timetable completeness is missing or unfinished'}</small></div></div><div className="availability-room-action"><span>Academic availability: {status === 'occupied' ? 'occupied' : status === 'available' ? 'free' : 'unknown'}<br />Operational: {operational ? 'available' : room.operational_status || 'inactive'}<br />Reservation: {reservationAvailable ? 'available' : reason || 'unavailable'}</span>{canContinue && <button className="secondary-button" onClick={() => onReserve(room, { date, start: interval.start, end: interval.end, startPeriod: interval.startPeriod, startPeriodNumber: interval.startPeriod, endPeriod: interval.endPeriod, endPeriodNumber: interval.endPeriod, duration: interval.endPeriod - interval.startPeriod + 1, mode: 'normal' })}>Continue to booking</button>}</div></article>;
        })}</div>}
      </>}
      {facultyView && dateInTerm && periods.length > 0 && !scheduleUnavailable && (!facultyId ? <Empty title="Select a faculty member." text={facultyProfiles.length ? 'Faculty records are from the academic directory.' : 'Faculty directory records are unavailable; assignments alone cannot enumerate unassigned faculty.'} /> : <div className="availability-list">{derivePeriodAvailability(filteredPeriods, dayEntries, { scopeStatus: institutionStatus, matches: (entry) => entry.faculty_id === facultyId }).map(({ period, entry, status }) => <ScheduleRow key={period.id} period={period} status={status} detail={entry ? `${entry.subject || 'Subject'} · ${termSections.find((section) => section.id === entry.section_id)?.code || 'Section'} · ${rooms.find((room) => room.id === entry.room_id)?.code || 'Room not recorded'}` : ''} emptyText="No faculty assignment in this complete institutional timetable" />)}</div>)}
      {studentView && dateInTerm && periods.length > 0 && !scheduleUnavailable && (!selectedSection ? <Empty title="Select a student section." text="Section free periods require that section's own completeness scope." /> : <div className="availability-list">{derivePeriodAvailability(periods, dayEntries, { scopeStatus: sectionStatus, matches: (entry) => entry.section_id === selectedSection.id }).map(({ period, entry, status }) => <ScheduleRow key={period.id} period={period} status={status} detail={entry ? `${entry.subject || 'Subject'} · ${facultyProfiles.find((person) => person.id === entry.faculty_id)?.display_name || entry.faculty_id || 'Faculty'} · ${rooms.find((room) => room.id === entry.room_id)?.code || 'Room not recorded'}` : ''} emptyText="No class assigned to this section in its complete timetable" />)}</div>)}
    </>}
  </section>;
}

function scopeLabel(status) { return complete(status) ? `Timetable completeness: ${status}` : `Timetable completeness: ${String(status || 'missing').replaceAll('_', ' ')}. Empty periods are unknown.`; }
function Empty({ title, text }) { return <div className="availability-empty"><strong>{title}</strong><p>{text}</p></div>; }
function ScheduleRow({ period, status, detail, emptyText }) { return <article className="availability-room"><div><strong>{period.display_name} · {shortTime(period.starts_at)}–{shortTime(period.ends_at)}</strong><p>{status === 'occupied' ? detail : status === 'available' ? emptyText : 'No assignment recorded; completeness is not confirmed'}</p></div><span className={status === 'occupied' ? 'occupied-text' : 'row-status'}>{status === 'occupied' ? 'Occupied' : status === 'available' ? 'Free' : 'Unknown'}</span></article>; }
function AvailabilityHeader({ view, onViewChange }) {
  const title = view === 'classrooms' ? 'Find an academically free classroom.' : view === 'faculty' ? 'See faculty schedules.' : view === 'labs' ? 'Laboratory availability.' : 'Student section free time.';
  return <><div className="page-intro"><div><p className="eyebrow">CAMPUS AVAILABILITY / TIMETABLE INTELLIGENCE</p><h2>{title}</h2><p>Academic availability is derived from canonical timetable periods and explicit completeness scopes; it does not confirm a reservation.</p></div></div><div className="availability-tabs" aria-label="Campus availability views">{[['classrooms', 'Classrooms'], ['labs', 'Laboratories'], ['faculty', 'Faculty'], ['students', 'Student free time']].map(([key, label]) => <button key={key} type="button" className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => onViewChange(key)}>{label}</button>)}</div></>;
}
