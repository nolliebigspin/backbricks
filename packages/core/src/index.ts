export {
  type AvailableModules,
  type InfraRequirement,
  type InfraService,
  requiredInfrastructure,
} from './modules/infrastructure.ts';
export {
  type Config,
  type ConfigIssue,
  type ConfigResult,
  type Env,
  formatConfigIssues,
  loadConfig,
  loadConfigFromProcessEnv,
  parseModuleList,
  resolveFileVariables,
  type ScannerConfig,
  type StorageConfig,
} from './config/load.ts';
export {
  createIds,
  ID_PREFIXES,
  type IdPrefix,
  type Ids,
  isTypeId,
  parseTypeId,
  type TypeId,
} from './ids/type-id.ts';
export type {
  TenantContext,
  AuthenticatedTenantContext,
  TenantTransaction,
  TenantHandle,
  WithTenant,
} from './tenancy/tenant-context.ts';
export * from './tenancy/repositories.ts';
export * from './platform/models.ts';
export {
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  pageQuerySchema,
  repositoryPage,
  encodePageCursor,
  pageResult,
} from './http/pagination.ts';
export { AUTH_BASE_PATH } from './http/auth-path.ts';
export { API_KEY_PREFIXES, API_KEY_ALPHABET, MAX_KEY_SCOPES } from './keys/constants.ts';
export {
  API_KEY_TOKEN_LENGTH,
  scopeNameSchema,
  secretKeyTokenSchema,
  publishableKeyTokenSchema,
} from './keys/protocol.ts';
export {
  principalSchema,
  sessionIdentitySchema,
  secretKeyIdentitySchema,
  type Principal,
  type SessionIdentity,
  type SecretKeyIdentity,
  type SecretKeyResolver,
  type CredentialRequest,
} from './identity/principal.ts';
export {
  createManagementAuthorizer,
  ORGANIZATION_SELECTION_HEADER,
  CSRF_HEADER,
  type ManagementRequest,
} from './identity/management-authorization.ts';
export { canonicalIp, resolveClientIp, createIpIdentity } from './privacy/ip-identity.ts';
export type { AuthReplayStore } from './privacy/auth-replay.ts';
export {
  membershipSchema,
  authInvitationSchema,
  type Membership,
  type AuthInvitation,
  type OrganizationIdentityStore,
} from './identity/organization.ts';
export {
  createRateLimiter,
  rateLimitInputSchema,
  MAX_RATE_LIMIT_COUNT,
  type RateLimitInput,
  type RateLimitResult,
  type RateLimitBucket,
  type RateLimitStore,
  type RateLimiter,
} from './abuse/rate-limiter.ts';
export {
  MAIL_BODY_LIMIT,
  mailMessageSchema,
  type MailMessage,
  type Mailer,
} from './mail/contract.ts';
export { escapeHtml, renderAuthMail, type AuthMailInput } from './mail/templates.ts';
export { expiresAfterDays, MILLISECONDS_PER_DAY } from './time/retention.ts';
export {
  principalActor,
  activityMetadataSchema,
  AUDIT_RETENTION_DAYS,
  EVENT_RETENTION_DAYS,
  auditMutationSchema,
  eventMutationSchema,
  type AuditMutation,
  type EventMutation,
  type AuditService,
  type EventService,
  createAuditService,
  createEventService,
} from './services/activity.ts';
export { type Clock, systemClock } from './time/clock.ts';
export {
  AppError,
  type AppErrorOptions,
  type FieldError,
  type ProblemDetails,
  toProblemDetails,
} from './errors/app-error.ts';
export {
  ERROR_CODES,
  ERROR_TYPE_BASE_URL,
  type ErrorCode,
  type ErrorStatus,
} from './errors/codes.ts';
export {
  isSecretField,
  REDACTED,
  redactFields,
  redactSecrets,
  redactSecretText,
} from './logging/redact.ts';
export { fieldErrorSchema, problemDetailsSchema } from './errors/schema.ts';
export {
  actorTypeSchema,
  apiKeyKindSchema,
  moduleInstanceStatusSchema,
  notificationChannelSchema,
} from './platform/values.ts';
export {
  DEFAULT_BODY_LIMIT_BYTES,
  type ManagementRoutePolicy,
  managementRoutePolicySchema,
  type OrganizationRole,
  organizationRoleSchema,
  meetsOrganizationRole,
  type RoutePolicy,
  routePolicySchema,
} from './http/route-policy.ts';
export {
  httpOriginSchema,
  allowedOriginsSchema,
  isOriginAllowed,
  MAX_ALLOWED_ORIGINS,
} from './http/origins.ts';
export {
  projectCreateSchema,
  projectPatchSchema,
  projectSettingsSchema,
  projectResponseSchema,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_SLUG_MAX_LENGTH,
  type ProjectCreate,
  type ProjectPatch,
} from './projects/schemas.ts';

export { createProjectService, type ProjectService } from './projects/service.ts';
export { createInstanceService, type InstanceService } from './instances/service.ts';
export { revisionResponseSchema, instancePreconditionSchema } from './instances/schemas.ts';
export {
  configDocumentSchema,
  configEntrySchema,
  configPlanResponseSchema,
  configWriteSchema,
  CONFIG_SCHEMA_ID,
  CONFIG_PLAN_TTL_MS,
  type ConfigDocument,
  type ConfigWrite,
} from './configuration/schemas.ts';
export { planConfiguration } from './configuration/planner.ts';
export { createConfigurationService, type ConfigurationService } from './configuration/service.ts';
export { configurationJsonSchema } from './configuration/schema-export.ts';
export { configApplyResponseSchema } from './configuration/schemas.ts';
export {
  CONFIG_ACCESS,
  CONFIG_DESTRUCTIVE_SCOPE,
  requireConfigAccess,
} from './instances/permissions.ts';
export {
  instanceCreateSchema,
  instancePatchSchema,
  instanceResponseSchema,
  instanceKeySchema,
  instanceVersionSchema,
  MAX_INSTANCE_VERSION,
  type InstanceCreate,
  type InstancePatch,
} from './instances/schemas.ts';

export {
  KEY_SCOPES,
  createKeyScopeCatalog,
  keyScopeDefinitionSchema,
  type KeyScopeCatalog,
  KEY_SCOPE_PRESETS,
  keyScopeSchema,
  keyScopesSchema,
  keyPresetSchema,
  keyPresetScopes,
  type KeyScope,
} from './keys/scopes.ts';
export {
  API_KEY_DISPLAY_TOKEN_LENGTH,
  generateApiKey,
  hashApiKey,
  createApiKeyMaterial,
  isApiKeyActive,
} from './keys/material.ts';

export { apiKeyMetadataSchema, apiKeyMetadata } from './keys/metadata.ts';

export {
  apiKeyCreateSchema,
  apiKeyCreationResponseSchema,
  KEY_NAME_MAX_LENGTH,
  type ApiKeyCreate,
} from './keys/creation.ts';
export { createKeyService, type KeyService } from './keys/service.ts';

export {
  createSecretKeyResolver,
  secretKeyReferenceSchema,
  KEY_LAST_USED_INTERVAL_MS,
  KEY_EXPOSURE_NOTIFICATION_WINDOW_MS,
  type SecretKeyReference,
  type SecretKeyLookup,
  type KeyExposureNotice,
} from './keys/authentication.ts';
export {
  createUsageService,
  metricNameSchema,
  usagePeriodSchema,
  usageIncrementSchema,
  monthlyUsagePeriod,
  MAX_USAGE_VALUE,
  type UsageIncrement,
  type UsageService,
} from './services/usage.ts';
export {
  createUnlimitedEntitlements,
  type Entitlements,
  type EntitlementDecision,
} from './services/entitlements.ts';
export {
  createServiceContainer,
  type CoreServices,
  type OptionalServices,
  type OptionalServiceName,
  type ServiceContainer,
} from './services/container.ts';
export type {
  StorageAdapter,
  SignedStorageRequest,
  StorageObject,
  InlineImageType,
  Scanner,
  ScanVerdict,
  CaptchaProvider,
  Queue,
  BillingProvider,
  BillingPlanChange,
} from './services/providers.ts';

export {
  auditFiltersSchema,
  activityIdentifierSchema,
  activityNameSchema,
  type AuditFilters,
} from './platform/activity-fields.ts';
export {
  auditQuerySchema,
  auditResponseSchema,
  auditPageSchema,
  usageQuerySchema,
  usageResponseSchema,
  integrationResponseSchema,
} from './queries/schemas.ts';
export { createPlatformQueries, type PlatformQueries } from './queries/platform.ts';

export {
  bindCapability,
  capabilityView,
  type CapabilityMap,
  type CapabilityName,
  type Capability,
  type CapabilityLookup,
  type CapabilityFactories,
} from './modules/capabilities.ts';
export {
  jsonValueSchema,
  canonicalJson,
  moduleNameSchema,
  localizedNameSchema,
  scopeDefinitionSchema,
  eventDefinitionSchema,
  metricDefinitionSchema,
  configChangeReportSchema,
  type JsonValue,
  type ScopeDefinition,
  type EventDefinition,
  type MetricDefinition,
  type ConfigChangeReport,
} from './modules/values.ts';
export type {
  ModuleDefinition,
  ModuleRuntime,
  ModuleServices,
  ModuleExecution,
  ConfiguredInstance,
} from './modules/contract.ts';
export type {
  ModuleInputSchema,
  ModuleResponseDefinition,
  ModuleRouteSpec,
  ModuleAdminRouter,
  ModulePublicRouter,
} from './modules/routes.ts';
export {
  MAX_JOB_RETENTION_SECONDS,
  type ModuleJobSpec,
  type ModuleJobRegistrar,
} from './modules/jobs.ts';

export { defineModule } from './modules/define-module.ts';
export { defineRegistry, type ModuleRegistry } from './modules/registry.ts';
export type { RegisteredModule, RegisteredRoute, RegisteredJob } from './modules/registered.ts';

export { CORE_EVENTS } from './services/event-types.ts';

export {
  defineModuleDescriptor,
  defineModuleCatalog,
  unavailableModuleAtPath,
  moduleAvailabilitySchema,
  platformMetaSchema,
  type ModuleDescriptor,
  type ModuleCatalogEntry,
  type SelectedModules,
} from './modules/catalog.ts';
