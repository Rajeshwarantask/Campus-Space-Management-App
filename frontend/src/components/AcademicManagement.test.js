import React from 'react';
import { render, screen } from '@testing-library/react';
import AcademicManagement from './AcademicManagement';

test('does not expose academic write forms before the database migration is available', () => {
  render(<AcademicManagement available={false} schemaMissing schemaError="Migration not deployed" academicData={{}} rooms={[]} entries={[]} onRefresh={jest.fn()} onToast={jest.fn()} />);
  expect(screen.getByText(/Academic database migration required/i)).toBeInTheDocument();
  expect(screen.getByText(/Migration not deployed/i)).toBeInTheDocument();
  expect(screen.queryByText(/Create academic year/i)).not.toBeInTheDocument();
});
