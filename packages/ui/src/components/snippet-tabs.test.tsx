import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { type Snippet, SnippetTabs } from '#components/snippet-tabs';

const snippets: Snippet[] = [
  { id: 'html', label: 'HTML', content: <pre>{'<form action="…">'}</pre> },
  { id: 'react', label: 'React', content: <pre>{'backbricks.forms.submit()'}</pre> },
];

afterEach(cleanup);

describe('SnippetTabs', () => {
  test('renders one tab per snippet inside a labelled tab list', () => {
    render(<SnippetTabs label="Integration examples" snippets={snippets} />);

    expect(screen.getByRole('tablist', { name: 'Integration examples' })).toBeDefined();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['HTML', 'React']);
  });

  test('shows the first snippet by default', () => {
    render(<SnippetTabs label="Examples" snippets={snippets} />);

    expect(screen.getByRole('tab', { name: 'HTML' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('<form action="…">');
  });

  test('switches the panel when another tab is activated', () => {
    render(<SnippetTabs label="Examples" snippets={snippets} />);

    // Radix tabs activate on mousedown (not click) for pointer input.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'React' }), { button: 0 });

    expect(screen.getByRole('tab', { name: 'React' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('backbricks.forms.submit()');
  });

  test('honours defaultId', () => {
    render(<SnippetTabs label="Examples" snippets={snippets} defaultId="react" />);

    expect(screen.getByRole('tabpanel').textContent).toBe('backbricks.forms.submit()');
  });

  test('renders code as text, never as HTML', () => {
    render(<SnippetTabs label="Examples" snippets={snippets} />);

    expect(screen.getByRole('tabpanel').querySelector('form')).toBeNull();
  });

  test('renders nothing without snippets', () => {
    const { container } = render(<SnippetTabs label="Examples" snippets={[]} />);

    expect(container.innerHTML).toBe('');
  });
});
