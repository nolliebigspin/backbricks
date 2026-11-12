import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';

import { FieldListEditor } from '#components/field-list-editor';
import { TypedConfirmDialog } from '#components/typed-confirm-dialog';

afterEach(cleanup);

type Item = { id: string; name: string };
const labels = {
  list: 'Fields',
  edit: (name: string) => `Edit ${name}`,
  moveUp: (name: string) => `Up ${name}`,
  moveDown: (name: string) => `Down ${name}`,
  remove: (name: string) => `Remove ${name}`,
};

function Harness() {
  const [items, setItems] = useState<Item[]>([
    { id: 'a', name: 'Name' },
    { id: 'b', name: 'Email' },
  ]);
  return (
    <FieldListEditor
      items={items}
      getId={(item) => item.id}
      getName={(item) => item.name}
      renderSummary={() => 'Short text'}
      renderEditor={(item) => <p>{`Editor for ${item.name}`}</p>}
      onChange={setItems}
      labels={labels}
      renderAdd={(add) => (
        <button type="button" onClick={() => add({ id: 'c', name: 'Phone' })}>
          Add
        </button>
      )}
    />
  );
}

const names = () =>
  within(screen.getByRole('list', { name: 'Fields' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('span')?.textContent);

test('fields move with buttons, the ends are disabled, and removing drops the field', () => {
  render(<Harness />);
  expect(names()).toEqual(['Name', 'Email']);
  expect(screen.getByRole('button', { name: 'Up Name' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Down Email' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Down Name' }));
  expect(names()).toEqual(['Email', 'Name']);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Email' }));
  expect(names()).toEqual(['Name']);
});

test('editors open on demand and an added field opens right away', () => {
  render(<Harness />);
  expect(screen.queryByText('Editor for Name')).toBeNull();
  const edit = screen.getByRole('button', { name: 'Edit Name' });
  fireEvent.click(edit);
  expect(edit.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Editor for Name')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByText('Editor for Phone')).toBeDefined();
});

test('the typed confirmation enables only for the exact word', () => {
  let confirmed = 0;
  render(
    <TypedConfirmDialog
      title="Delete?"
      description="Gone for good."
      confirmText="contact"
      typeLabel='Type "contact"'
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={() => (confirmed += 1)}
      onClose={() => undefined}
    >
      <p>Details</p>
    </TypedConfirmDialog>,
  );
  const dialog = screen.getByRole('alertdialog');
  const confirm = within(dialog).getByRole('button', { name: 'Delete' });
  expect(within(dialog).getByText('Details')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Type "contact"'), { target: { value: 'Contact' } });
  expect(confirm.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Type "contact"'), { target: { value: 'contact' } });
  fireEvent.click(confirm);
  expect(confirmed).toBe(1);
});
