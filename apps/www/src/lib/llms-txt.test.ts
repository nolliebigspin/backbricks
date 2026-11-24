import { describe, expect, test } from 'bun:test';

import { bricks, faq, links, site } from '../content/site.ts';
import { llmsTxt } from './llms-txt.ts';

describe('llms.txt', () => {
  const text = llmsTxt();

  test('follows the llmstxt.org shape: H1 name, then a blockquote summary', () => {
    const [h1, blank, summary] = text.split('\n');
    expect(h1).toBe(`# ${site.name}`);
    expect(blank).toBe('');
    expect(summary).toBe(`> ${site.description}`);
  });

  test('describes all three bricks as self-hostable in the developer preview', () => {
    for (const brick of bricks) expect(text).toContain(`**${brick.name}** (Self-hostable)`);
    expect(text).toContain(`Status: ${site.status}.`);
  });

  test('includes every FAQ answer and project link', () => {
    for (const item of faq) expect(text).toContain(`### ${item.question}\n\n${item.answer}`);
    for (const href of Object.values(links)) expect(text).toContain(`](${href})`);
  });
});
