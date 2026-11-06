import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render, screen } from '@testing-library/react';

import { HomePage } from './home-page.tsx';
import { initI18n } from './i18n/index.ts';

afterEach(cleanup);

describe('HomePage', () => {
  test('renders the English copy', async () => {
    await initI18n('en');
    render(<HomePage />);
    expect(screen.getByText('Welcome to Backbricks')).toBeDefined();
    expect(screen.getByText('The dashboard is running.')).toBeDefined();
  });

  test('renders the German copy', async () => {
    await initI18n('de');
    render(<HomePage />);
    expect(screen.getByText('Willkommen bei Backbricks')).toBeDefined();
  });
});
