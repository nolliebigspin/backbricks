export function serverOptions() {
  return {
    baseUrl: process.env['BACKBRICKS_BASE_URL'] ?? process.env['NEXT_PUBLIC_BACKBRICKS_URL'],
    secretKey: process.env['BACKBRICKS_SECRET_KEY'],
  };
}
