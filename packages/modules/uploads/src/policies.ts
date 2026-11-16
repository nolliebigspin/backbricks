/** Module-owned management defaults; all routes still register explicit role/scope declarations. */
export const uploadManagementPolicy = (
  operation: string,
  scope: 'data:read' | 'stats:read' | 'data:delete' = 'data:read',
  role: 'member' | 'admin' = 'member',
  bodyLimitBytes = 1024,
) => ({
  kind: 'management' as const,
  bodyLimitBytes,
  session: { role },
  secretKey: { scope },
  isolationCase: `uploads.${operation}`,
});
