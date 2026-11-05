import { describe, expect, test } from 'bun:test';

import de from './de.json';
import en from './en.json';
import { detectLanguage } from './index.ts';

function keys(object: object, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('dashboard translations', () => {
  test('en and de have exactly the same keys', () => {
    expect(keys(de).toSorted()).toEqual(keys(en).toSorted());
  });

  test('no translation is empty', () => {
    for (const messages of [en, de]) {
      expect(JSON.stringify(messages)).not.toContain('""');
    }
  });

  test('German browsers get German, everything else English', () => {
    expect(detectLanguage(['de-AT', 'en'])).toBe('de');
    expect(detectLanguage(['fr', 'de'])).toBe('de');
    expect(detectLanguage(['en-GB'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
});
