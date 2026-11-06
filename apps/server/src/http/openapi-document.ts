import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../context.ts';

const document = { openapi: '3.1.0', info: { title: 'Backbricks API', version: '0.0.0' } } as const;
/** Runtime documentation and committed code generation share one document definition. */
export const apiDocument = (app: OpenAPIHono<AppEnv>) => app.getOpenAPI31Document(document);
