// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

export const garageConfig = z
  .object({
    GARAGE_ADMIN_URL: z.url(),
    GARAGE_ADMIN_TOKEN: z.string().min(32),
    GARAGE_CAPACITY_BYTES: z.coerce.number().int().positive(),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().regex(/^GK[a-f0-9]{24}$/),
    S3_SECRET_ACCESS_KEY: z.string().regex(/^[a-f0-9]{64}$/),
    S3_CORS_ORIGINS: z.string().optional(),
  })
  .safeParse(process.env);
