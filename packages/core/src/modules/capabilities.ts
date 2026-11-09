import { AppError } from '../errors/app-error.ts';
import type { TenantHandle } from '../tenancy/tenant-context.ts';

/** The deletion seam is available before uploads; M3 adds claiming and listing. */
export interface FilesCapability {
  deleteByOwner(tx: TenantHandle, owner: { type: string; id: string }): Promise<void>;
}

/** Modules augment this public interface with transaction-first capability contracts. */
export interface CapabilityMap {
  readonly files: FilesCapability;
  readonly [name: string]: object;
}
export type CapabilityName = Extract<keyof CapabilityMap, string>;
export type Capability<K extends CapabilityName> = CapabilityMap[K];
export type CapabilityLookup = <K extends CapabilityName>(name: K) => Capability<K> | null;
export type CapabilityFactories<Runtime> = Partial<{
  [K in keyof CapabilityMap]: (runtime: Runtime) => CapabilityMap[K];
}>;

/** A borrowed capability cannot run against another transaction or after its original one ends. */
export function bindCapability<T extends object>(tx: TenantHandle, capability: T): T {
  return new Proxy(capability, {
    get(target, name) {
      const value: unknown = Reflect.get(target, name);
      if (typeof value !== 'function') return value;
      return (provided: TenantHandle, ...args: unknown[]): unknown => {
        tx.assertActive();
        if (provided !== tx) {
          if (
            provided?.context.organizationId !== tx.context.organizationId ||
            provided?.context.projectId !== tx.context.projectId
          )
            throw new AppError('not_found');
          throw new AppError('internal_error', {
            detail: 'Capability calls must share the caller transaction.',
          });
        }
        const result: unknown = Reflect.apply(value, target, [provided, ...args]);
        return result;
      };
    },
  });
}

/** Declared names are snapshotted; JavaScript callers cannot bypass the same rules as TypeScript. */
export function capabilityView<R extends CapabilityName, O extends CapabilityName>(
  tx: TenantHandle,
  lookup: CapabilityLookup,
  declarations: { required: readonly R[]; optional: readonly O[] },
) {
  const required = new Set<CapabilityName>(declarations.required);
  const optional = new Set<CapabilityName>(declarations.optional);
  return Object.freeze({
    require<K extends R>(name: K): Capability<K> {
      tx.assertActive();
      if (!required.has(name))
        throw new AppError('internal_error', { detail: 'Capability access was not declared.' });
      const value = lookup(name);
      if (value === null)
        throw new AppError('service_unavailable', {
          detail: `Required capability is unavailable: ${name}.`,
        });
      return value;
    },
    optional<K extends O>(name: K): Capability<K> | null {
      tx.assertActive();
      if (!optional.has(name))
        throw new AppError('internal_error', { detail: 'Capability access was not declared.' });
      return lookup(name);
    },
  });
}
