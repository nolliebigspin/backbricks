// Violation: a module defining its own table instead of declaring a repository interface (ADR-0055).
// Fixtures have no node_modules, so the driver import is unresolved on purpose.
// @ts-expect-error -- drizzle-orm is deliberately not installed for fixtures.
import { pgTable, text } from 'drizzle-orm/pg-core';

export const formSubmissions = pgTable('form_submissions', { id: text('id').primaryKey() });
