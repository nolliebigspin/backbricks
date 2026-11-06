import { expect, test } from 'bun:test';

import { createIds, defineModuleCatalog, platformMetaSchema, systemClock } from '@backbricks/core';
import { formsDescriptor } from '@backbricks/module-forms';

import { createApp } from './app.ts';
import { createLogger } from './logger.ts';
import { moduleCatalog } from './modules.ts';
import { metaRoutes } from './routes/meta.ts';

function application(modules = moduleCatalog.select(['forms'])) {
  return createApp(
    {
      modules,
      log: createLogger('silent'),
      ids: createIds(systemClock),
      readinessChecks: [],
      dashboardDir: null,
    },
    (api) => metaRoutes(api, modules),
  );
}

test('public metadata names selected descriptors without claiming operational domain APIs', async () => {
  const modules = defineModuleCatalog([formsDescriptor]).select(['forms']);
  const app = application(modules);
  const response = await app.request('/v1/meta');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchInlineSnapshot(`
    {
      "modules": [
        {
          "displayName": {
            "de": "Formulare",
            "en": "Forms",
          },
          "enabled": true,
          "operational": false,
          "resourceName": {
            "plural": "forms",
            "singular": "form",
          },
          "type": "forms",
        },
      ],
    }
  `);
  expect(app.apiRoutes.manifest.filter((route) => route.policy.kind === 'management')).toHaveLength(
    0,
  );
  const openapi = await (await app.request('/v1/openapi.json')).text();
  expect(openapi).toContain('/v1/meta');
  expect(openapi).not.toContain('/submissions');
  expect(openapi).not.toContain('/files');
  const empty = application(defineModuleCatalog([]).select([]));
  expect(await (await empty.request('/v1/meta')).json()).toEqual({ modules: [] });
});

test('known disabled and unimplemented namespaces return only installation-wide availability', async () => {
  const app = application();
  const metadata = platformMetaSchema.parse(await (await app.request('/v1/meta')).json());
  expect(
    metadata.modules.map((module) => [module.type, module.enabled, module.operational]),
  ).toEqual([
    ['uploads', false, false],
    ['forms', true, false],
    ['reviews', false, false],
  ]);
  const paths = [
    '/v1/public/forms/contact/submissions',
    '/v1/projects/foreign/forms/contact',
    '/v1/public/upload-zones/cv/files',
    '/v1/projects/foreign/upload-zones/cv',
    '/v1/public/review-collections/testimonials/reviews',
  ];
  const responses = await Promise.all(paths.map((path) => Promise.resolve(app.request(path))));
  for (const response of responses) {
    expect(response.status).toBe(404);
    // oxlint-disable-next-line no-await-in-loop -- Inspect each completed independent response.
    const body: unknown = await response.json();
    expect(body).toMatchObject({ code: 'module_not_enabled', status: 404 });
    expect(JSON.stringify(body)).not.toContain('foreign');
  }
  const unknown = await app.request('/v1/projects/foreign/unknown/key');
  expect(await unknown.json()).toMatchObject({ code: 'not_found' });
});
