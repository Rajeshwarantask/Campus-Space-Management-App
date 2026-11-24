import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CampusAvailability from './CampusAvailability';

const TODAY = new Date().toISOString().slice(0, 10);

test('does not report vacancies when the academic schema is not deployed', () => {
  render(<CampusAvailability view="classrooms" rooms={[]} entries={[]} academicData={{}} academicSchema={{ available: false, schemaMissing: true, error: 'Migration not deployed' }} onReserve={jest.fn()} onViewChange={jest.fn()} />);
  expect(screen.getByText(/needs the academic database migration/i)).toBeInTheDocument();
  expect(screen.queryByText(/Academic vacancy/i)).not.toBeInTheDocument();
});

const availabilityProps = (status) => ({
  view: 'classrooms',
  rooms: [{ id: 'room-1', code: 'A101', name: 'Room 101', building: 'A', floor: 1, capacity: 30, category: 'classroom', equipment: ['Projector'], is_active: true }],
  entries: [],
  academicSchema: { available: true },
  academicData: {
    years: [{ id: 'year-1', name: '2026–2027' }],
    terms: [{ id: 'term-1', academic_year_id: 'year-1', name: 'Semester 1', starts_on: '2026-01-01', ends_on: '2026-12-31', status: 'active' }],
    sections: [],
    periods: [{ id: 'period-1', term_id: 'term-1', period_number: 1, display_name: 'Period 1', starts_at: '09:00:00', ends_at: '09:40:00', is_active: true }],
    completeness: [{ id: 'scope-1', term_id: 'term-1', scope_type: 'institution', status }],
  },
  onReserve: jest.fn(),
  onReservationSearch: jest.fn(async () => ({ data: [{ room_id: 'room-1', availability_status: 'available' }] })),
  onViewChange: jest.fn(),
});

test('keeps empty room periods unknown while institutional completeness is in progress', async () => {
  render(<CampusAvailability {...availabilityProps('in_progress')} />);
  expect(await screen.findByText(/Academic availability: unknown/i)).toBeInTheDocument();
  expect(screen.queryByText('Academic vacancy')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Continue to booking/i })).not.toBeInTheDocument();
});

test('reports academic vacancy separately from the authoritative reservation result', async () => {
  render(<CampusAvailability {...availabilityProps('complete')} />);
  expect(await screen.findByText(/Academic availability: free/i)).toBeInTheDocument();
  expect(screen.getByText(/Reservation: available/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continue to booking/i })).toBeInTheDocument();
});

const currentDay = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`).getDay() || 7;
const assignedEntry = { id: 'assignment-1', term_id: 'term-1', day_of_week: currentDay, period: 1, starts_at: '09:00:00', ends_at: '09:40:00', room_id: 'room-1', faculty_id: 'faculty-1', section_id: 'section-1', subject: 'Physics' };

function assignedProps(view, completeness = 'complete') {
  return {
    ...availabilityProps(completeness),
    view,
    entries: [assignedEntry],
    rooms: [
      { id: 'room-1', code: 'A101', name: 'Lecture room', category: 'classroom', is_active: true, operational_status: 'available' },
      { id: 'lab-1', code: 'L201', name: 'Science lab', category: 'laboratory', is_active: true, operational_status: 'available' },
    ],
    academicData: {
      ...availabilityProps(completeness).academicData,
      periods: [...availabilityProps(completeness).academicData.periods, { id: 'period-2', term_id: 'term-1', period_number: 2, display_name: 'Period 2', starts_at: '10:15:00', ends_at: '10:55:00', is_active: true }],
      sections: [{ id: 'section-1', term_id: 'term-1', code: 'S1', name: 'Section One', is_active: true }],
      facultyProfiles: [{ id: 'faculty-1', display_name: 'Dr. Ada Lovelace', staff_identifier: 'F-01' }],
    },
  };
}

test('shows an assigned classroom as occupied and excludes laboratories from classrooms', async () => {
  render(<CampusAvailability {...assignedProps('classrooms')} />);
  expect(await screen.findByText(/A101 · Lecture room/)).toBeInTheDocument();
  expect(screen.getByText(/occupied/i)).toBeInTheDocument();
  expect(screen.queryByText(/L201 · Science lab/)).not.toBeInTheDocument();
  expect(screen.getByText(/Physics/)).toBeInTheDocument();
});

test('shows laboratories only in the laboratory perspective', async () => {
  render(<CampusAvailability {...assignedProps('labs')} />);
  expect(await screen.findByText(/L201 · Science lab/)).toBeInTheDocument();
  expect(screen.queryByText(/A101 · Lecture room/)).not.toBeInTheDocument();
});

test('keeps operational restrictions separate from an academically free room', async () => {
  const props = availabilityProps('complete');
  props.rooms[0].operational_status = 'maintenance';
  render(<CampusAvailability {...props} />);
  expect(await screen.findByText(/Academic availability: free/i)).toBeInTheDocument();
  expect(screen.getByText(/Operational: maintenance/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Continue to booking/i })).not.toBeInTheDocument();
});

test('does not present inactive rooms as usable discovery results', () => {
  const props = availabilityProps('complete');
  props.rooms[0].is_active = false;
  render(<CampusAvailability {...props} />);
  expect(screen.queryByText(/A101 · Room 101/)).not.toBeInTheDocument();
});

test('uses the selected interval including a canonical gap for availability and booking handoff', async () => {
  const props = availabilityProps('complete');
  props.academicData.periods.push({ id: 'period-2', term_id: 'term-1', period_number: 2, display_name: 'Period 2', starts_at: '10:15:00', ends_at: '10:55:00', is_active: true });
  render(<CampusAvailability {...props} />);
  fireEvent.change(screen.getByLabelText('End period'), { target: { value: '2' } });
  const button = await screen.findByRole('button', { name: /Continue to booking/i });
  fireEvent.click(button);
  await waitFor(() => expect(props.onReserve).toHaveBeenCalledWith(props.rooms[0], expect.objectContaining({ date: TODAY, start: '09:00:00', end: '10:55:00', startPeriod: 1, endPeriod: 2, duration: 2, mode: 'normal' })));
});

test('shows query failures and does not reuse old reservation results', async () => {
  const props = availabilityProps('complete');
  props.onReservationSearch = jest.fn().mockResolvedValueOnce({ data: [{ room_id: 'room-1', availability_status: 'available' }] }).mockResolvedValueOnce({ error: 'RPC unavailable', data: null });
  const { rerender } = render(<CampusAvailability {...props} />);
  expect(await screen.findByText(/Reservation: available/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Minimum capacity'), { target: { value: '20' } });
  rerender(<CampusAvailability {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/RPC unavailable/);
  expect(screen.queryByText(/Reservation: available/i)).not.toBeInTheDocument();
});

test('narrows real room metadata with category, building, floor, capacity and equipment filters', async () => {
  const props = availabilityProps('complete');
  props.rooms.push(
    { id: 'room-2', code: 'B201', name: 'Workshop', building: 'B', floor: 2, capacity: 60, category: 'classroom', equipment: ['Whiteboard'], is_active: true },
    { id: 'room-3', code: 'U001', name: 'Unclassified space', building: 'B', floor: 2, capacity: 70, category: null, equipment: ['Whiteboard'], is_active: true },
  );
  props.onReservationSearch = jest.fn(async () => ({ data: props.rooms.map((room) => ({ room_id: room.id, availability_status: 'available' })) }));
  render(<CampusAvailability {...props} />);
  expect(await screen.findByText(/A101 · Room 101/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'unclassified' } });
  expect(await screen.findByText(/U001 · Unclassified space/)).toBeInTheDocument();
  expect(screen.queryByText(/A101 · Room 101/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.change(screen.getByLabelText('Start period'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('End period'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Building'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('Floor'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Minimum capacity'), { target: { value: '55' } });
  fireEvent.change(screen.getByLabelText('Equipment'), { target: { value: 'Whiteboard' } });
  await waitFor(() => expect(props.onReservationSearch).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), { building: 'B', minCapacity: 55, equipment: 'Whiteboard' }));
  expect(await screen.findByText(/B201 · Workshop/)).toBeInTheDocument();
  expect(screen.queryByText(/A101 · Room 101/)).not.toBeInTheDocument();
});

test('queries the newly selected term and day and never reuses stale availability', async () => {
  const props = assignedProps('classrooms');
  props.academicData.years.push({ id: 'year-2', name: '2027–2028' });
  props.academicData.terms.push({ id: 'term-2', academic_year_id: 'year-2', name: 'Semester 2', starts_on: '2026-01-01', ends_on: '2026-12-31', status: 'active' });
  props.academicData.periods.push({ id: 'period-2', term_id: 'term-2', period_number: 1, starts_at: '10:10:00', ends_at: '10:55:00', is_active: true });
  props.timetableSelection = { termId: 'term-1', dayOfWeek: currentDay };
  props.onScheduleQuery = jest.fn();
  const { rerender } = render(<CampusAvailability {...props} />);
  fireEvent.change(screen.getByLabelText('Academic year'), { target: { value: 'year-2' } });
  expect(props.onScheduleQuery).toHaveBeenCalledWith('term-2', currentDay);
  rerender(<CampusAvailability {...props} timetableSelection={{ termId: 'term-2', dayOfWeek: currentDay }} />);
  expect(await screen.findByText(/Reservation: available/i)).toBeInTheDocument();
  expect(screen.getAllByText(/10:10–10:55/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2027-01-02' } });
  expect(props.onScheduleQuery).toHaveBeenLastCalledWith('term-2', new Date('2027-01-02T12:00:00').getDay() || 7);
});

test('displays timetable query failures rather than deriving free periods', () => {
  render(<CampusAvailability {...availabilityProps('complete')} academicSchema={{ available: true, timetableError: 'Query failed' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
  expect(screen.queryByText(/Academic availability: free/i)).not.toBeInTheDocument();
});
