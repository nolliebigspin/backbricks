import { describe, expect, test } from 'bun:test';

import { brickStatusLabel, bricks, faq, links, site } from '../content/site.ts';
import { llmsTxt } from './llms-txt.ts';

describe('llms.txt', () => {
  const text = llmsTxt();

  test('follows the llmstxt.org shape: H1 name, then a blockquote summary', () => {
    const [h1, blank, summary] = text.split('\n');
    expect(h1).toBe(`# ${site.name}`);
    expect(blank).toBe('');
    expect(summary).toBe(`> ${site.description}`);
  });

  test('states the same release status as the landing page', () => {
    for (const brick of bricks)
      expect(text).toContain(`${brick.name} ${brickStatusLabel(brick).toLowerCase()}`);
    expect(text).toContain(`Status: ${site.status}.`);
  });

  test('includes every FAQ answer and project link', () => {
    for (const item of faq) expect(text).toContain(`### ${item.question}\n\n${item.answer}`);
    for (const href of Object.values(links)) expect(text).toContain(`](${href})`);
  });
});
