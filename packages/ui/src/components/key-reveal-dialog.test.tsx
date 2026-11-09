import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

import { KeyRevealDialog } from '#components/key-reveal-dialog';

const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => {
  cleanup();
  if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

function Fixture() {
  const [token, setToken] = useState<string | null>('one-time-test-value');
  return token ? (
    <KeyRevealDialog
      token={token}
      title="New key"
      description="Save it now"
      copyLabel="Copy"
      closeLabel="Dismiss"
      copiedLabel="Copied"
      copyErrorLabel="Copy blocked"
      onClose={() => setToken(null)}
    />
  ) : null;
}

test('copy and dismiss remove the revealed value from the document', async () => {
  let copied = '';
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: async (value: string) => {
        copied = value;
      },
    },
    configurable: true,
  });
  render(<Fixture />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied'));
  expect(copied).toBe('one-time-test-value');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByDisplayValue('one-time-test-value')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('Escape and outside clicks cannot discard the one-time value', () => {
  render(<Fixture />);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.pointerDown(document.body);
  expect(screen.getByDisplayValue('one-time-test-value')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
});
