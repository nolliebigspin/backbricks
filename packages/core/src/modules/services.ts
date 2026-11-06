import type { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import type { CoreServices, OptionalServices } from '../services/container.ts';
import type { TenantHandle, TenantTransaction } from '../tenancy/tenant-context.ts';
import type { ModuleExecution } from './execution.ts';
import type { MetricDefinition } from './values.ts';

type Bound<T> = {
  [K in keyof T]: T[K] extends (tx: TenantTransaction, ...args: infer A) => infer R
    ? (tx: TenantHandle, ...args: A) => R
    : T[K];
};
export type BoundCoreServices = Omit<
  CoreServices,
  'audit' | 'events' | 'usage' | 'entitlements'
> & {
  audit: Bound<CoreServices['audit']>;
  events: Bound<CoreServices['events']>;
  usage: Bound<CoreServices['usage']>;
  entitlements: Bound<CoreServices['entitlements']>;
};
export type ModuleOptionalServices = Omit<OptionalServices, 'queue'> & {
  queue: Bound<NonNullable<OptionalServices['queue']>> | null;
};

/** The framework alone maps a module's opaque handle back to its caller's repositories. */
export function moduleServices(
  execution: ModuleExecution,
  declarations: {
    requiredServices: readonly (keyof OptionalServices)[];
    optionalServices: readonly (keyof OptionalServices)[];
    events: readonly { name: string }[];
    usageMetrics: readonly MetricDefinition[];
    jobs: readonly { name: string; payload: z.ZodType }[];
  },
) {
  const { tx, handle } = execution;
  const view = execution.services.forModule({
    required: declarations.requiredServices,
    optional: declarations.optionalServices,
  });
  const events = new Set(declarations.events.map((event) => event.name));
  const metrics = new Map(declarations.usageMetrics.map((metric) => [metric.name, metric]));
  const jobs = new Map(declarations.jobs.map((job) => [job.name, job.payload]));
  function actual(provided: TenantHandle): TenantTransaction {
    tx.assertActive();
    if (provided !== handle) {
      if (
        provided.context.organizationId !== tx.context.organizationId ||
        provided.context.projectId !== tx.context.projectId
      )
        throw new AppError('not_found');
      throw new AppError('internal_error', {
        detail: 'Services must share the caller transaction.',
      });
    }
    return tx;
  }
  function checkMetric(name: string) {
    if (metrics.get(name)?.kind !== 'counter')
      throw new AppError('internal_error', { detail: 'Counter metric was not declared.' });
  }
  const core: BoundCoreServices = {
    clock: view.clock,
    ids: view.ids,
    rateLimiter: view.rateLimiter,
    audit: { record: (provided, input) => view.audit.record(actual(provided), input) },
    events: {
      publish(provided, input) {
        if (!events.has(input.type))
          throw new AppError('internal_error', { detail: 'Event was not declared.' });
        return view.events.publish(actual(provided), input);
      },
    },
    usage: {
      increment(provided, input) {
        checkMetric(input.metric);
        return view.usage.increment(actual(provided), input);
      },
      async list(provided, period) {
        return (await view.usage.list(actual(provided), period)).filter((row) =>
          metrics.has(row.metric),
        );
      },
    },
    entitlements: {
      check(provided, input) {
        checkMetric(input.metric);
        return view.entitlements.check(actual(provided), input);
      },
    },
  };
  const queue = execution.services.optional('queue');
  const providers: ModuleOptionalServices = {
    storage: execution.services.optional('storage'),
    scanner: execution.services.optional('scanner'),
    captcha: execution.services.optional('captcha'),
    mailer: execution.services.optional('mailer'),
    billing: execution.services.optional('billing'),
    queue:
      queue === null
        ? null
        : {
            enqueue(provided, name, payload, options) {
              const schema = jobs.get(name);
              if (!schema)
                throw new AppError('internal_error', { detail: 'Job was not declared.' });
              return queue.enqueue(actual(provided), name, schema.parse(payload), options);
            },
          },
  };
  return Object.freeze({
    ...core,
    require<K extends keyof OptionalServices>(name: K): NonNullable<ModuleOptionalServices[K]> {
      view.require(name);
      const provider = providers[name];
      if (provider === null) throw new AppError('service_unavailable');
      return provider;
    },
    optional<K extends keyof OptionalServices>(name: K): ModuleOptionalServices[K] {
      view.optional(name);
      return providers[name];
    },
  });
}
