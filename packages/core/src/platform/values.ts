import { z } from 'zod';

/** Credential kinds persisted by the platform; auth sessions are a separate identity layer. */
export const apiKeyKindSchema = z.enum(['publishable', 'secret']);
/** Attribution for administrative mutations and configuration revisions. */
export const actorTypeSchema = z.enum(['user', 'api_key', 'mcp', 'system']);
/** Lifecycle of a module's configuration, independent of its personal records. */
export const moduleInstanceStatusSchema = z.enum(['active', 'paused', 'archived']);
/** Notification delivery channel implemented in the first release. */
export const notificationChannelSchema = z.enum(['email']);
