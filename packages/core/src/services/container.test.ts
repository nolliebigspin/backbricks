import { expect, test } from 'bun:test';

import {
  createTestCoreServices as coreServices,
  testClock as clock,
} from '../../test/service-fixture.ts';
import {
  createServiceContainer,
  type Mailer,
  type OptionalServices,
  type OptionalServiceName,
} from '../index.ts';

const mailer: Mailer = { send: async () => {}, close: async () => {} };

test('service views preserve shared instances and provide only declared optional/required providers', () => {
  const core = coreServices();
  const container = createServiceContainer(core, { mailer });
  const view = container.forModule({ required: ['mailer'], optional: ['storage', 'scanner'] });
  expect(view.clock).toBe(clock);
  expect(view.audit).toBe(core.audit);
  expect(view.usage).toBe(core.usage);
  expect(view.require('mailer')).toBe(mailer);
  expect(view.optional('storage')).toBeNull();
  expect(view.optional('scanner')).toBeNull();
  expect(Reflect.get(view, 'withTenant')).toBeUndefined();
  expect(Reflect.get(view, 'providers')).toBeUndefined();
  expect(Reflect.get(view, 'storage')).toBeUndefined();
  expect(Object.isFrozen(view)).toBe(true);
  expect(() => Reflect.apply(view.require, undefined, ['billing'])).toThrow(
    'Service access was not declared.',
  );
  expect(() => Reflect.apply(view.optional, undefined, ['billing'])).toThrow(
    'Service access was not declared.',
  );
});

test('missing required providers fail immediately, while empty/optional-only subsets work', () => {
  const empty = createServiceContainer(coreServices());
  expect(
    empty
      .forModule({
        required: [],
        optional: ['mailer', 'storage', 'captcha', 'queue', 'billing', 'scanner'],
      })
      .optional('captcha'),
  ).toBeNull();
  expect(() => empty.forModule({ required: ['storage'], optional: [] })).toThrow(
    'Required service is unavailable',
  );
  expect(() => empty.forModule({ required: ['mailer'], optional: ['mailer'] })).toThrow(
    'both required and optional',
  );
  const undefinedProvider = createServiceContainer(coreServices(), { mailer: undefined });
  expect(() => undefinedProvider.forModule({ required: ['mailer'], optional: [] })).toThrow(
    'Required service is unavailable',
  );
});

test('provider and declaration snapshots cannot gain rights through caller alias mutation', () => {
  const providers: Partial<OptionalServices> = { mailer };
  const required: OptionalServiceName[] = ['mailer'];
  const container = createServiceContainer(coreServices(), providers);
  const view = container.forModule({ required, optional: [] });
  providers.mailer = null;
  required.push('billing');
  expect(view.require('mailer')).toBe(mailer);
  expect(() => view.require('billing')).toThrow('Service access was not declared.');
});
