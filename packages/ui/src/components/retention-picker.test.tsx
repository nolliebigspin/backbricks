import { afterEach, expect, test } from 'bun:test';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RetentionPicker } from '#components/retention-picker';

afterEach(cleanup);

const labels = { dayLabel: (days: number) => `${days} days`, unlimitedLabel: 'No time limit' };

test('keeps a non-preset stored value and reports unlimited as null', () => {
  const changes: (number | null)[] = [];
  render(
    <RetentionPicker
      aria-label="Keep entries"
      value={45}
      onChange={(value) => changes.push(value)}
      {...labels}
    />,
  );
  const select = screen.getByLabelText<HTMLSelectElement>('Keep entries');
  expect([...select.options].map((option) => option.textContent)).toEqual([
    '30 days',
    '45 days',
    '90 days',
    '180 days',
    '365 days',
    '730 days',
    'No time limit',
  ]);
  expect(select.value).toBe('45');
  fireEvent.change(select, { target: { value: 'unlimited' } });
  fireEvent.change(select, { target: { value: '90' } });
  expect(changes).toEqual([null, 90]);
});

test('shows unlimited as selected for null', () => {
  render(<RetentionPicker aria-label="Keep" value={null} onChange={() => {}} {...labels} />);
  expect(screen.getByLabelText<HTMLSelectElement>('Keep').value).toBe('unlimited');
});
