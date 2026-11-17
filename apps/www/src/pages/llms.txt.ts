import type { APIRoute } from 'astro';

import { llmsTxt } from '../lib/llms-txt.ts';

export const GET: APIRoute = () =>
  new Response(llmsTxt(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
