import { describe, expect, test } from 'bun:test';

import { faq, siteUrl } from '../content/site.ts';
import { landingNodes, siteNodes, toJsonLd } from './structured-data.ts';

describe('structured data', () => {
  test('every @id reference points to a node in the landing graph', () => {
    const nodes = [...siteNodes(), ...landingNodes()];
    const ids = new Set(nodes.map((node) => node['@id']));
    const refs = JSON.stringify(nodes).matchAll(/\{"@id":"([^"]+)"\}/g);
    for (const [, ref] of refs) expect(ids).toContain(ref);
  });

  test('ids and URLs are absolute on the production domain', () => {
    for (const node of [...siteNodes(), ...landingNodes()]) {
      expect(node['@id']?.startsWith(`${siteUrl}/`)).toBe(true);
    }
  });

  test('the FAQ page carries every question with its full answer', () => {
    const faqPage = landingNodes().find((node) => node['@type'] === 'FAQPage');
    expect(faqPage?.['mainEntity']).toEqual(
      faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    );
  });

  test('serialized JSON-LD cannot close its script element', () => {
    const json = toJsonLd([{ '@type': 'Thing', name: '</script><script>alert(1)</script>' }]);
    expect(json).not.toContain('<');
    expect(JSON.parse(json)['@graph'][0].name).toBe('</script><script>alert(1)</script>');
  });
});
