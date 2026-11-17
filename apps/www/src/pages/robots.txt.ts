import type { APIRoute } from 'astro';

// Generated so the sitemap URL follows `site` in astro.config.ts. `*` already admits search and
// AI crawlers (Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot, …).
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
