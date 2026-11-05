/**
 * Settings for the dev Garage instance. Defaults match compose.yaml and
 * docker/garage/garage.toml; env variables override them (host runs use localhost URLs).
 * These are fixed dev values, never used outside the local environment.
 */
export type GarageDevSettings = {
  adminUrl: string;
  adminToken: string;
  s3Endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  corsOrigins: string[];
  capacityBytes: number;
};

export function garageDevSettings(env: Record<string, string | undefined>): GarageDevSettings {
  return {
    adminUrl: env['GARAGE_ADMIN_URL'] ?? 'http://localhost:3903',
    adminToken: env['GARAGE_ADMIN_TOKEN'] ?? 'backbricks-dev-admin-token',
    s3Endpoint: env['S3_ENDPOINT'] ?? 'http://localhost:3900',
    region: env['S3_REGION'] ?? 'garage',
    bucket: env['S3_BUCKET'] ?? 'backbricks',
    accessKeyId: env['S3_ACCESS_KEY_ID'] ?? 'GKbac4b41c4500000000000000',
    secretAccessKey:
      env['S3_SECRET_ACCESS_KEY'] ??
      'bac4b41c45000000000000000000000000000000000000000000000000000000',
    corsOrigins: (env['S3_CORS_ORIGINS'] ?? 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    capacityBytes: 1_000_000_000,
  };
}
