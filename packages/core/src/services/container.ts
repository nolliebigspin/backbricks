import type { RateLimiter } from '../abuse/rate-limiter.ts';
import { AppError } from '../errors/app-error.ts';
import type { Ids } from '../ids/type-id.ts';
import type { Mailer } from '../mail/contract.ts';
import type { Clock } from '../time/clock.ts';
import type { AuditService, EventService } from './activity.ts';
import type { Entitlements } from './entitlements.ts';
import type {
  BillingProvider,
  CaptchaProvider,
  Queue,
  Scanner,
  StorageAdapter,
} from './providers.ts';
import type { UsageService } from './usage.ts';

/** Shared pure/transactional services. No unbound tenant selector or raw database is exposed to modules. */
export type CoreServices = Readonly<{
  clock: Clock;
  ids: Ids;
  audit: AuditService;
  events: EventService;
  usage: UsageService;
  entitlements: Entitlements;
  rateLimiter: RateLimiter;
}>;
export type OptionalServices = {
  storage: StorageAdapter | null;
  scanner: Scanner | null;
  captcha: CaptchaProvider | null;
  mailer: Mailer | null;
  queue: Queue | null;
  billing: BillingProvider | null;
};
export type OptionalServiceName = keyof OptionalServices;

/** A module gets only its declared providers; missing required providers fail at composition time. */
export function createServiceContainer(
  core: CoreServices,
  providers: Partial<OptionalServices> = {},
) {
  const base = Object.freeze({ ...core });
  const available: Readonly<OptionalServices> = Object.freeze({
    storage: providers.storage ?? null,
    scanner: providers.scanner ?? null,
    captcha: providers.captcha ?? null,
    mailer: providers.mailer ?? null,
    queue: providers.queue ?? null,
    billing: providers.billing ?? null,
  });
  function provider<K extends OptionalServiceName>(name: K): NonNullable<OptionalServices[K]> {
    const value = available[name];
    if (value === null)
      throw new AppError('service_unavailable', {
        detail: `Required service is unavailable: ${name}.`,
      });
    return value;
  }
  function forModule<R extends OptionalServiceName, O extends OptionalServiceName>(declarations: {
    required: readonly R[];
    optional: readonly O[];
  }) {
    const required = new Set<OptionalServiceName>(declarations.required);
    const optional = new Set<OptionalServiceName>(declarations.optional);
    for (const name of required) {
      if (optional.has(name))
        throw new AppError('internal_error', {
          detail: 'A service cannot be both required and optional.',
        });
      provider(name);
    }
    return Object.freeze({
      ...base,
      require<K extends R>(name: K): NonNullable<OptionalServices[K]> {
        if (!required.has(name))
          throw new AppError('internal_error', { detail: 'Service access was not declared.' });
        return provider(name);
      },
      optional<K extends O>(name: K): OptionalServices[K] {
        if (!optional.has(name))
          throw new AppError('internal_error', { detail: 'Service access was not declared.' });
        return available[name];
      },
    });
  }
  return Object.freeze({
    core: base,
    provider,
    optional: <K extends OptionalServiceName>(name: K) => available[name],
    forModule,
  });
}
export type ServiceContainer = ReturnType<typeof createServiceContainer>;
