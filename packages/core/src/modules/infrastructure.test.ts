import { describe, expect, test } from 'bun:test';

import { loadConfig } from '../config/load.ts';
import { type AvailableModules, requiredInfrastructure } from './infrastructure.ts';

describe('requiredInfrastructure', () => {
  const modules: AvailableModules = {
    uploads: [{ service: 'storage' }, { service: 'scanner', optional: true }],
    gallery: [{ service: 'storage' }, { service: 'scanner' }],
    forms: [],
  };

  test('only enabled modules count', () => {
    expect([...requiredInfrastructure(modules, ['forms']).keys()]).toEqual([]);
  });

  test('a service is optional only if every enabled module declares it optional', () => {
    expect(requiredInfrastructure(modules, ['uploads']).get('scanner')).toEqual({ optional: true });
    expect(requiredInfrastructure(modules, ['uploads', 'gallery']).get('scanner')).toEqual({
      optional: false,
    });
  });

  test('a required scanner is not defaulted to SCANNER=none', () => {
    const result = loadConfig(
      {
        DATABASE_URL: 'postgres://localhost/backbricks',
        APP_SECRET: 'x'.repeat(32),
        BACKBRICKS_MODULES: 'gallery',
        S3_ENDPOINT: 'http://localhost:3900',
        S3_REGION: 'garage',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      },
      modules,
    );
    expect(result.ok ? [] : result.issues.map((issue) => issue.variable)).toEqual(['SCANNER']);
  });
});
