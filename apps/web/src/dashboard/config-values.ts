/** Read a JSON object into an editable copy; schemas on the server remain authoritative. */
export function configObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
