import { createContext, useContext } from 'react';

import type { auth } from '../auth/client.ts';

export type Tenant = {
  organizationId: string;
  role: NonNullable<Awaited<ReturnType<typeof auth.organization.getActiveMember>>['data']>['role'];
};
export const TenantContext = createContext<Tenant | null>(null);
export function useTenant() {
  const tenant = useContext(TenantContext);
  if (!tenant) throw new Error('Missing dashboard organization');
  return tenant;
}
export function tenantHeaders(organizationId: string) {
  return { 'x-backbricks-organization-id': organizationId };
}
export function canManage(role: string) {
  return role === 'owner' || role === 'admin';
}
