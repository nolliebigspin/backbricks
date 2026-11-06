import type { TenantTransaction } from '@backbricks/core';

import type { DbTransaction } from './client.ts';

// Internal capability map: never exported from the package or provided to module callbacks.
const bindings = new WeakMap<TenantTransaction, DbTransaction>();
export function bindTransaction(handle: TenantTransaction, transaction: DbTransaction) {
  bindings.set(handle, transaction);
}
export function transactionFor(handle: TenantTransaction): DbTransaction {
  handle.assertActive();
  const transaction = bindings.get(handle);
  if (!transaction) throw new Error('Unknown tenant transaction.');
  return transaction;
}
export function releaseTransaction(handle: TenantTransaction) {
  bindings.delete(handle);
}
