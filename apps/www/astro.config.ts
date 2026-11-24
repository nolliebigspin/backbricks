import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import { siteUrl } from './src/content/site.ts';

export default defineConfig({
  site: siteUrl,
  // Matches Vercel's `cleanUrls` + `trailingSlash: false` (vercel.json): /privacy, not /privacy/.
  trailingSlash: 'never',
  build: { format: 'file' },
  redirects: {
    '/errors': '/docs/errors',
    '/errors/[code]': '/docs/errors/[code]',
  },
  integrations: [
    react(),
    sitemap(),
    starlight({
      title: 'Backbricks Docs',
      favicon: '/favicon.svg',
      disable404Route: true,
      expressiveCode: false,
      components: { Head: './src/components/docs-head.astro' },
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'Overview', link: '/docs' },
            { label: 'Self-host with Docker', link: '/docs/self-host' },
          ],
        },
        {
          label: 'Add a brick',
          items: [
            { label: 'Forms', link: '/docs/forms' },
            { label: 'Private uploads', link: '/docs/uploads' },
            { label: 'Reviews', link: '/docs/reviews' },
          ],
        },
        { label: 'CLI and MCP', link: '/docs/cli' },
        {
          label: 'Quickstarts',
          items: [
            { label: 'Next.js', link: '/docs/nextjs' },
            { label: 'Astro', link: '/docs/astro' },
            { label: 'Vue', link: '/docs/vue' },
            { label: 'HTML', link: '/docs/html' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API reference', link: '/docs/api' },
            { label: 'API errors', link: '/docs/errors' },
          ],
        },
      ],
    }),
  ],
  // Prism highlights with classes; Shiki's inline styles would break the strict CSP below.
  markdown: { syntaxHighlight: 'prism' },
  security: {
    // Astro hashes its own inline scripts/styles into a per-page CSP <meta>. Directives that
    // can't live in a <meta> (frame-ancestors) are sent as headers from vercel.json.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // Radix Tabs renders two style attributes on the server. Allow exactly those values
      // instead of 'unsafe-inline'. If a Radix update changes them, the browser console prints
      // the new hash to put here.
      styleDirective: {
        resources: ["'self'", "'unsafe-hashes'"],
        hashes: [
          'sha256-MtxTLcyxVEJFNLEIqbVTaqR4WWr0+lYSZ78AzGmNsuA=', // outline:none
          'sha256-PhrR5O1xWiklTp5YfH8xWeig83Y/rhbrdb5whLn1pSg=', // animation-duration:0s
        ],
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    // prismjs loads languages with runtime require(); bundling it breaks the static prerender.
    environments: { prerender: { resolve: { external: ['prismjs'] } } },
  },
});
