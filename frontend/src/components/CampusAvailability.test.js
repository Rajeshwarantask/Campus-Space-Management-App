import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import CampusAvailability from './CampusAvailability';

test('does not report vacancies when the academic schema is not deployed', () => {
  render(<CampusAvailability view="classrooms" rooms={[]} entries={[]} academicData={{}} academicSchema={{ available: false, schemaMissing: true, error: 'Migration not deployed' }} onReserve={jest.fn()} onViewChange={jest.fn()} />);
  expect(screen.getByText(/needs the academic database migration/i)).toBeInTheDocument();
  expect(screen.queryByText(/Academic vacancy/i)).not.toBeInTheDocument();
});

const availabilityProps = (status) => ({
  view: 'classrooms',
  rooms: [{ id: 'room-1', code: 'A101', name: 'Room 101', building: 'A', floor: 1, capacity: 30, category: 'classroom', is_active: true }],
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
  onViewChange: jest.fn(),
});

test('keeps empty room periods unknown while institutional completeness is in progress', () => {
  render(<CampusAvailability {...availabilityProps('in_progress')} />);
  expect(screen.getByText(/Academic availability: unknown/i)).toBeInTheDocument();
  expect(screen.queryByText('Academic vacancy')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Continue to booking/i })).not.toBeInTheDocument();
});

test('reports an academic vacancy only after the institution timetable is complete', () => {
  render(<CampusAvailability {...availabilityProps('complete')} />);
  expect(screen.getByText(/Academic availability: free/i)).toBeInTheDocument();
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

test('shows an assigned classroom as occupied and excludes laboratories from classrooms', () => {
  render(<CampusAvailability {...assignedProps('classrooms')} />);
  expect(screen.getByText(/A101 · Lecture room/)).toBeInTheDocument();
  expect(screen.getByText(/Occupied/)).toBeInTheDocument();
  expect(screen.queryByText(/L201 · Science lab/)).not.toBeInTheDocument();
  expect(screen.getByText(/Physics/)).toBeInTheDocument();
});

test('shows laboratories only in the laboratory perspective', () => {
  render(<CampusAvailability {...assignedProps('labs')} />);
  expect(screen.getByText(/L201 · Science lab/)).toBeInTheDocument();
  expect(screen.queryByText(/A101 · Lecture room/)).not.toBeInTheDocument();
});

test('keeps operational restrictions separate from an academically free room', () => {
  const props = availabilityProps('complete');
  props.rooms[0].operational_status = 'maintenance';
  render(<CampusAvailability {...props} />);
  expect(screen.getByText(/Academic availability: free/i)).toBeInTheDocument();
  expect(screen.getByText(/Operational: maintenance/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Continue to booking/i })).not.toBeInTheDocument();
});

test('keeps inactive rooms visible as academically free but operationally unusable', () => {
  const props = availabilityProps('complete');
  props.rooms[0].is_active = false;
  render(<CampusAvailability {...props} />);
  const room = screen.getByText(/A101 · Room 101/).closest('.availability-room');
  expect(room).toHaveTextContent('Academic availability: free');
  expect(room).toHaveTextContent('Operational: inactive');
  expect(within(room).queryByRole('button', { name: /Continue to booking/i })).not.toBeInTheDocument();
});

test('shows faculty assignment as occupied and unassigned periods unknown without institutional completeness', () => {
  render(<CampusAvailability {...assignedProps('faculty', 'in_progress')} />);
  fireEvent.change(screen.getByLabelText('Faculty member'), { target: { value: 'faculty-1' } });
  expect(screen.getByText(/Occupied/)).toBeInTheDocument();
  expect(screen.getByText(/Physics.*S1/)).toBeInTheDocument();
  expect(screen.getByText('Unknown')).toBeInTheDocument();
});

test('uses section completeness for occupied and unknown section periods', () => {
  const props = assignedProps('students', 'complete');
  props.academicData.completeness = [
    { term_id: 'term-1', scope_type: 'institution', status: 'complete' },
    { term_id: 'term-1', scope_type: 'section', section_id: 'section-1', status: 'in_progress' },
  ];
  render(<CampusAvailability {...props} />);
  fireEvent.change(screen.getByLabelText('Student section'), { target: { value: 'section-1' } });
  expect(screen.getByText(/Occupied/)).toBeInTheDocument();
  expect(screen.getByText('Unknown')).toBeInTheDocument();
});

test('uses the selected section completeness to derive a free period', () => {
  const props = assignedProps('students', 'in_progress');
  props.entries = [];
  props.academicData.completeness = [{ term_id: 'term-1', scope_type: 'section', section_id: 'section-1', status: 'published' }];
  render(<CampusAvailability {...props} />);
  fireEvent.change(screen.getByLabelText('Student section'), { target: { value: 'section-1' } });
  expect(screen.getAllByText('Free')).toHaveLength(2);
});

test('queries the newly selected term and day and never reuses stale availability', () => {
  const props = assignedProps('classrooms');
  props.academicData.years.push({ id: 'year-2', name: '2027–2028' });
  props.academicData.terms.push({ id: 'term-2', academic_year_id: 'year-2', name: 'Semester 2', starts_on: '2026-01-01', ends_on: '2026-12-31', status: 'active' });
  props.academicData.periods.push({ id: 'period-2', term_id: 'term-2', period_number: 1, display_name: 'Period 1', starts_at: '10:10:00', ends_at: '10:55:00', is_active: true });
  props.timetableSelection = { termId: 'term-1', dayOfWeek: currentDay };
  props.onScheduleQuery = jest.fn();
  const { rerender } = render(<CampusAvailability {...props} />);
  fireEvent.change(screen.getByLabelText('Academic year'), { target: { value: 'year-2' } });
  expect(props.onScheduleQuery).toHaveBeenCalledWith('term-2', currentDay);
  rerender(<CampusAvailability {...props} timetableSelection={{ termId: 'term-2', dayOfWeek: currentDay }} />);
  expect(screen.getByText(/10:10–10:55/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2027-01-02' } });
  expect(props.onScheduleQuery).toHaveBeenLastCalledWith('term-2', new Date('2027-01-02T12:00:00').getDay() || 7);
});

test('displays timetable query failures rather than deriving free periods', () => {
  render(<CampusAvailability {...availabilityProps('complete')} academicSchema={{ available: true, timetableError: 'Query failed' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
  expect(screen.queryByText(/Academic availability: free/i)).not.toBeInTheDocument();
});
