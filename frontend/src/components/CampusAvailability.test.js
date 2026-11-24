import React from 'react';
import { render, screen } from '@testing-library/react';
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
  expect(screen.getByText('Unknown')).toBeInTheDocument();
  expect(screen.queryByText('Academic vacancy')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Continue to booking/i })).not.toBeInTheDocument();
});

test('reports an academic vacancy only after the institution timetable is complete', () => {
  render(<CampusAvailability {...availabilityProps('complete')} />);
  expect(screen.getByText('Academic vacancy')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continue to booking/i })).toBeInTheDocument();
});
