import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { DataTable } from '#components/data-table';
import { FieldValue } from '#components/field-value';

afterEach(cleanup);

type Row = { id: string; message: string };
const rows: Row[] = [
  { id: 'a', message: '<img src=x onerror="alert(1)">' },
  { id: 'b', message: 'Second' },
];
const labels = {
  yes: 'Yes',
  no: 'No',
  empty: 'Empty',
  accepted: (version: string) => `Accepted ${version}`,
};

function Harness({ onOpen }: { onOpen: (row: Row) => void }) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  return (
    <>
      <DataTable
        rows={rows}
        caption="Entries"
        getRowId={(row) => row.id}
        columns={[
          {
            id: 'message',
            header: 'Message',
            renderCell: (row) => <FieldValue value={row.message} labels={labels} />,
          },
        ]}
        selection={selection}
        onSelectionChange={setSelection}
        selectLabel={(row) => `Select ${row.id}`}
        selectAllLabel="Select all"
        onOpen={onOpen}
        openLabel={(row) => `Open ${row.id}`}
      />
      <output>{[...selection].toSorted().join(',')}</output>
    </>
  );
}

test('renders hostile values as text, selects rows and opens a row', () => {
  const opened: string[] = [];
  const { container } = render(<Harness onOpen={(row) => opened.push(row.id)} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeDefined();
  fireEvent.click(screen.getByLabelText('Select b'));
  expect(screen.getByRole('status').textContent).toBe('b');
  fireEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByRole('status').textContent).toBe('a,b');
  fireEvent.click(screen.getByLabelText('Select all'));
  expect(screen.getByRole('status').textContent).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Open a' }));
  expect(opened).toEqual(['a']);
});

test('field values: option labels, consent, booleans and empty answers as plain text', () => {
  const options = [{ value: 'small', label: 'Small team' }];
  render(
    <ul>
      <li>
        <FieldValue value="small" options={options} labels={labels} />
      </li>
      <li>
        <FieldValue value={['small', 'other']} options={options} labels={labels} />
      </li>
      <li>
        <FieldValue value={{ accepted: true, version: '2', acceptedAt: 'x' }} labels={labels} />
      </li>
      <li>
        <FieldValue value={false} labels={labels} />
      </li>
      <li>
        <FieldValue value={undefined} labels={labels} />
      </li>
    </ul>,
  );
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Small team',
    'Small team, other',
    'Accepted 2',
    'No',
    'Empty',
  ]);
});
