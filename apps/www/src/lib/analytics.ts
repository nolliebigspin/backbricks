import { inject } from '@vercel/analytics';

/**
 * Starts Vercel Web Analytics (cookieless page views).
 *
 * Passes the build-time config Vercel provides when Web Analytics is enabled, so the script and
 * intake use randomized same-origin paths ("Resilient Intake") that pass our `'self'` CSP.
 * We call `inject()` directly instead of using `@vercel/analytics/astro`: the component reports
 * `Astro.url.pathname`, which is `/privacy.html` with our file-based build, not `/privacy`.
 */
export function startAnalytics(): void {
  inject(
    { basePath: import.meta.env.PUBLIC_VERCEL_OBSERVABILITY_BASEPATH },
    import.meta.env.PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG,
  );
}
