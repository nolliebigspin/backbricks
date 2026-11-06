import { createHash } from 'node:crypto';

import { z } from 'zod';

import { AppError } from '../errors/app-error.ts';
import { isOriginAllowed } from '../http/origins.ts';
import type { CredentialRequest } from '../identity/principal.ts';
import { validatedConfig } from '../instances/persistence.ts';
import type { RegisteredModule, RegisteredRoute } from '../modules/registered.ts';
import type { Entitlements } from '../services/entitlements.ts';
import type { CaptchaProvider } from '../services/providers.ts';
import type { TenantContext, TenantTransaction, WithTenant } from '../tenancy/tenant-context.ts';
import type { Clock } from '../time/clock.ts';
import {
  honeypotResponseSchema,
  publicWriteEnvelopeSchema,
  spamVerdict,
  type PublicWriteContext,
} from './policy.ts';
import { publicCredentialSchema } from './public-credentials.ts';
import type { RateLimiter } from './rate-limiter.ts';

const PROJECT_REQUESTS_PER_MINUTE = 600;
const GLOBAL_REQUESTS_PER_MINUTE = 100_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Public credentials never confer management membership. Empty origins still reject opaque origins. */
export function assertPublicOrigin(
  kind: 'secret' | 'publishable',
  allowed: readonly string[],
  origin: string | null,
) {
  if (
    kind === 'publishable' &&
    ((origin !== null && !isOriginAllowed(allowed, origin)) ||
      (origin === null && allowed.length > 0))
  )
    throw new AppError('forbidden');
}

/** Cheap checks finish before opening the domain transaction; proof replay claims use a separate pool connection. */
export function createAbuseGuard(deps: {
  clock: Clock;
  captcha: CaptchaProvider;
  limiter: RateLimiter;
  entitlements: Entitlements;
  withTenant: WithTenant;
}) {
  return async (input: {
    identity: unknown;
    request: CredentialRequest;
    module: RegisteredModule;
    route: RegisteredRoute;
    params: Record<string, string>;
    query: Record<string, unknown>;
    body: () => Promise<Uint8Array>;
    allowOrigin?: (origin: string) => void;
    run: (tx: TenantTransaction, input: unknown, context?: PublicWriteContext) => Promise<Response>;
  }) => {
    const identity = publicCredentialSchema.parse(input.identity);
    const { route, module, request } = input;
    const access = route.access;
    if (!access) throw new AppError('internal_error');
    const tenant: TenantContext = {
      organizationId: identity.organizationId,
      projectId: identity.projectId,
      ...(identity.kind === 'secret'
        ? { principal: { kind: 'secret_key' as const, id: identity.id, scopes: identity.scopes } }
        : {}),
    };
    const key = input.params[access.instanceParam];
    if (!key) throw new AppError('not_found');
    const prepared = await deps.withTenant(tenant, async (tx) => {
      const project = await tx.repositories.projects.get(identity.projectId);
      const instance = await tx.repositories.instances.getByKey(module.type, key);
      if (instance.status !== 'active') throw new AppError('not_found');
      return {
        allowedOrigins: project.allowedOrigins,
        instance,
        policy: module.publicWritePolicy(
          validatedConfig(module, instance.config, instance.moduleVersion),
        ),
      };
    });
    const origin = () => {
      assertPublicOrigin(identity.kind, prepared.allowedOrigins, request.origin);
      if (request.origin !== null) input.allowOrigin?.(request.origin);
    };
    if (access.kind === 'read') {
      origin();
      return deps.withTenant(tenant, (tx) =>
        input.run(tx, { params: input.params, query: input.query, body: null }),
      );
    }
    if (identity.kind === 'secret' && !identity.scopes.includes(access.secretScope))
      throw new AppError('forbidden');
    const body = await input.body();
    if (body.byteLength > Math.min(route.policy.bodyLimitBytes, prepared.policy.bodyLimitBytes))
      throw new AppError('payload_too_large');
    if (!request.ipHash) throw new AppError('service_unavailable');
    const limits = await Promise.all([
      deps.limiter.consume({
        namespace: 'public.instance_minute',
        identity: digest(`${request.ipHash}:${prepared.instance.id}`),
        limit: prepared.policy.perMinute,
        windowMs: 60_000,
      }),
      deps.limiter.consume({
        namespace: 'public.instance_hour',
        identity: digest(`${request.ipHash}:${prepared.instance.id}`),
        limit: prepared.policy.perHour,
        windowMs: 3_600_000,
      }),
      deps.limiter.consume({
        namespace: 'public.project',
        identity: digest(identity.projectId),
        limit: PROJECT_REQUESTS_PER_MINUTE,
        windowMs: 60_000,
      }),
      deps.limiter.consume({
        namespace: 'public.global',
        identity: digest('public'),
        limit: GLOBAL_REQUESTS_PER_MINUTE,
        windowMs: 60_000,
      }),
    ]);
    if (limits.some((result) => !result.allowed)) throw new AppError('rate_limited');
    origin();
    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new AppError('validation_failed');
    }
    const envelope = publicWriteEnvelopeSchema(z.unknown()).safeParse(decoded);
    if (!envelope.success) throw new AppError('validation_failed');
    const data = envelope.data.data;
    const payload =
      data !== null && typeof data === 'object' && !Array.isArray(data)
        ? Object.fromEntries(Object.entries(data))
        : data;
    let trapped = Boolean(envelope.data.honeypot);
    if (
      payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      prepared.policy.honeypotField in payload
    ) {
      const fields = Object.fromEntries(Object.entries(payload));
      trapped ||= Boolean(fields[prepared.policy.honeypotField]);
      delete fields[prepared.policy.honeypotField];
      Object.assign(payload, fields);
      Reflect.deleteProperty(payload, prepared.policy.honeypotField);
    }
    if (trapped) return Response.json(honeypotResponseSchema.parse({ accepted: true }));
    if (
      identity.kind === 'publishable' &&
      prepared.policy.proofOfWork &&
      !(await deps.captcha.verify(envelope.data.proof, {
        projectId: identity.projectId,
        now: deps.clock.now(),
      }))
    )
      throw new AppError('proof_invalid');
    const clean = { params: input.params, query: input.query, body: payload };
    const parsed = route.input.safeParse(clean);
    if (!parsed.success)
      throw new AppError('validation_failed', {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          code: issue.code,
          message: 'Invalid value.',
        })),
      });
    const context: PublicWriteContext = {
      instanceId: prepared.instance.id,
      configVersion: prepared.instance.configVersion,
      spam: spamVerdict(parsed.data.body),
    };
    return deps.withTenant(tenant, async (tx) => {
      const project = await tx.repositories.projects.get(identity.projectId, { lock: true });
      assertPublicOrigin(identity.kind, project.allowedOrigins, request.origin);
      const keyRecord = await tx.repositories.keys.get(identity.id, { lock: true });
      if (
        keyRecord.kind !== identity.kind ||
        keyRecord.revokedAt ||
        (keyRecord.expiresAt && keyRecord.expiresAt <= deps.clock.now())
      )
        throw new AppError('not_found');
      if (identity.kind === 'secret' && !keyRecord.scopes.includes(access.secretScope))
        throw new AppError('forbidden');
      const current = await tx.repositories.instances.getByKey(module.type, key);
      if (current.status !== 'active') throw new AppError('not_found');
      if (current.configVersion !== prepared.instance.configVersion) throw new AppError('conflict');
      if (access.quota) {
        let delta = 1n;
        if (access.quota.amountField) {
          const amount = z.record(z.string(), z.unknown()).parse(parsed.data.body)[
            access.quota.amountField
          ];
          const value = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).safeParse(amount);
          if (!value.success) throw new AppError('validation_failed');
          delta = BigInt(value.data);
        }
        if (!(await deps.entitlements.check(tx, { metric: access.quota.metric, delta })).allowed)
          throw new AppError('quota_exceeded');
      }
      return input.run(tx, clean, context);
    });
  };
}
