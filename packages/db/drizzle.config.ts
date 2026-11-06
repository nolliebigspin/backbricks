import { defineConfig } from 'drizzle-kit';

// `bun run db:generate` writes reviewed SQL migrations into ./migrations (ARCHITECTURE §B.5).
// Core tables live in ./src/schema (P1.2); module tables join this list from their packages.
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema'],
  out: './migrations',
});
