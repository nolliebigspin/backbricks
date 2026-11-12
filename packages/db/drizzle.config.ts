import { defineConfig } from 'drizzle-kit';

// `bun run db:generate` writes reviewed SQL migrations into ./migrations (ARCHITECTURE §B.5).
// Core and module tables both live in ./src/schema (ADR-0055).
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema'],
  out: './migrations',
});
