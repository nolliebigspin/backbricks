/** Inclusive calendar days in the visitor's timezone, shared by list and export filters. */
export function dateFilter(from: string, to: string) {
  return {
    ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
  };
}
