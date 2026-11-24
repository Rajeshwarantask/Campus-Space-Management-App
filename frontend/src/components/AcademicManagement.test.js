import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AcademicManagement from './AcademicManagement';

test('provides a discoverable CSV timetable import workflow to administrators', () => {
  render(<AcademicManagement available academicData={{ years: [], terms: [], sections: [], subjects: [], facultyProfiles: [], periods: [], completeness: [] }} rooms={[]} entries={[]} onRefresh={jest.fn()} onToast={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import timetable' }));
  expect(screen.getByRole('heading', { name: 'Import timetable' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Download CSV template' })).toHaveAttribute('download', 'northstar-timetable-template.csv');
  expect(screen.getByLabelText('Academic year')).toBeInTheDocument();
  expect(screen.getByLabelText('Academic term')).toBeInTheDocument();
  expect(screen.getByLabelText('Upload timetable CSV')).toBeInTheDocument();
});

test('does not expose academic write forms before the database migration is available', () => {
  render(<AcademicManagement available={false} schemaMissing schemaError="Migration not deployed" academicData={{}} rooms={[]} entries={[]} onRefresh={jest.fn()} onToast={jest.fn()} />);
  expect(screen.getByText(/Academic database migration required/i)).toBeInTheDocument();
  expect(screen.getByText(/Migration not deployed/i)).toBeInTheDocument();
  expect(screen.queryByText(/Create academic year/i)).not.toBeInTheDocument();
});
