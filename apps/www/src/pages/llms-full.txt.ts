import type { APIRoute } from 'astro';

import agent from '../../../../docs/integration/agent.md?raw';
import { llmsTxt } from '../lib/llms-txt.ts';

const guides = import.meta.glob('../content/docs/docs/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

export const GET: APIRoute = () =>
  new Response(
    [
      llmsTxt(),
      agent,
      ...Object.values(guides)
        .filter((guide): guide is string => typeof guide === 'string')
        .map((guide) => guide.replace(/^---\n[\s\S]*?\n---\n/, '')),
    ].join('\n\n'),
    { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
  );
