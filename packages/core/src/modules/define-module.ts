import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import type { OptionalServiceName } from '../services/container.ts';
import { capabilityView, type CapabilityName } from './capabilities.ts';
import { configuration } from './configuration.ts';
import type {
  ModuleDefinition,
  ModuleExecution,
  ModuleRuntime,
  RequiredInfrastructure,
  OptionalInfrastructure,
} from './contract.ts';
import type { InfraRequirement } from './infrastructure.ts';
import type { RegisteredModule } from './registered.ts';
import { jobRegistrar, routeRegistrar } from './registrars.ts';
import { moduleServices } from './services.ts';
import {
  checkedCount,
  freezeDeclaration,
  metadataSchema,
  serviceDeclarations,
} from './validation.ts';
import { jsonValueSchema } from './values.ts';

/** Capture typed hooks once; the static registry can then compose heterogeneous definitions safely. */
export function defineModule<
  T,
  const MT extends string,
  const R extends CapabilityName = never,
  const O extends CapabilityName = never,
  const SR extends OptionalServiceName = never,
  const SO extends OptionalServiceName = never,
  const I extends readonly InfraRequirement[] = readonly [],
>(definition: ModuleDefinition<T, R, O, SR, SO, I, MT>): RegisteredModule {
  const { type, configSchema } = definition;
  const infrastructure = z
    .array(
      z
        .object({ service: z.enum(['storage', 'scanner']), optional: z.boolean().optional() })
        .strict(),
    )
    .parse(definition.infrastructure);
  const services = serviceDeclarations(infrastructure, definition.services);
  const factories = { ...definition.provides };
  if (Object.values(factories).some((factory) => typeof factory !== 'function'))
    throw new AppError('invalid_request', { detail: 'Capability providers must be factories.' });
  const required = [...(definition.requires ?? [])];
  const optional = [...(definition.optional ?? [])];
  const metadata = freezeDeclaration(
    metadataSchema.parse({
      ...definition,
      ...services,
      requires: required,
      optional,
      provides: Object.keys(factories),
    }),
  );
  const config = configuration(definition);
  const retention = { ...definition.retention };
  const privacy = { ...definition.privacy };
  type Runtime = ModuleRuntime<
    T,
    R,
    O,
    SR | RequiredInfrastructure<I>,
    SO | OptionalInfrastructure<I>,
    MT
  >;
  function runtime(execution: ModuleExecution): Runtime {
    execution.tx.assertActive();
    if (execution.moduleType !== metadata.type) throw new AppError('internal_error');
    return Object.freeze({
      tx: execution.handle,
      repository: execution.tx.modules[type],
      config: (input: unknown) => configSchema.parse(input),
      capabilities: capabilityView(execution.handle, execution.capability, { required, optional }),
      services: moduleServices(execution, { ...metadata, jobs: jobs.jobs }),
    });
  }
  const admin = routeRegistrar(runtime, 'management');
  const publicRouter = routeRegistrar(runtime, 'public');
  const jobs = jobRegistrar(runtime);
  definition.adminRoutes?.(admin);
  definition.publicRoutes?.(publicRouter);
  definition.jobs?.(jobs);
  const emailSchema = z.email().max(320);
  return Object.freeze({
    ...metadata,
    infrastructure: Object.freeze(infrastructure),
    ...config,
    provide(name, execution) {
      if (!Object.hasOwn(factories, name)) return undefined;
      return factories[name]?.(runtime(execution));
    },
    adminRoutes: Object.freeze(admin.routes),
    publicRoutes: Object.freeze(publicRouter.routes),
    jobs: Object.freeze(jobs.jobs),
    retention: {
      async purgeExpired(execution, input) {
        const validated = z
          .object({ now: z.date(), limit: z.number().int().min(1).max(1000) })
          .strict()
          .parse(input);
        return checkedCount(await retention.purgeExpired(runtime(execution), validated));
      },
      async recomputeExpiry(execution, input, now) {
        return checkedCount(
          await retention.recomputeExpiry(
            runtime(execution),
            config.instance(input),
            z.date().parse(now),
          ),
        );
      },
    },
    privacy: {
      async exportSubject(execution, email) {
        return jsonValueSchema.parse(
          await privacy.exportSubject(runtime(execution), emailSchema.parse(email)),
        );
      },
      async deleteSubject(execution, email) {
        return checkedCount(
          await privacy.deleteSubject(runtime(execution), emailSchema.parse(email)),
        );
      },
    },
  });
}
