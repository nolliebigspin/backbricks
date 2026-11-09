/** Generated from openapi.json. Run bun run api:generate; do not edit. */
export interface paths {
  '/v1/auth/capabilities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAuthCapabilities'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/meta': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getPlatformMeta'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/openapi.json': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOpenApiDocument'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/organizations/{organizationId}/audit-logs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listOrganizationActivity'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjects'];
    put?: never;
    post: operations['createProject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProject'];
    put?: never;
    post?: never;
    delete: operations['archiveProject'];
    options?: never;
    head?: never;
    patch: operations['updateProject'];
    trace?: never;
  };
  '/v1/projects/{projectId}/audit-logs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listProjectActivity'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectConfig'];
    put: operations['planProjectConfig'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.instance.list'];
    put?: never;
    post: operations['forms.instance.create'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.instance.read'];
    put?: never;
    post?: never;
    delete: operations['forms.instance.archive'];
    options?: never;
    head?: never;
    patch: operations['forms.instance.update'];
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/export.csv': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.submissions.export'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/migrate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['forms.instance.migrate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/revisions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.instance.revisions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/revisions/{version}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.instance.revision'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/revisions/{version}/rollback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['forms.instance.rollback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/submissions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.submissions.list'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/submissions/bulk': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['forms.submissions.bulk'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/submissions/bulk-delete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['forms.submissions.bulk_delete'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/submissions/delete-all': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['forms.submissions.delete_all'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/submissions/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.submissions.read'];
    put?: never;
    post?: never;
    delete: operations['forms.submissions.delete'];
    options?: never;
    head?: never;
    patch: operations['forms.submissions.update'];
    trace?: never;
  };
  '/v1/projects/{projectId}/forms/{key}/summary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.summary'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/integration': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectIntegration'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/keys': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listKeys'];
    put?: never;
    post: operations['createKey'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/keys/{keyId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['revokeKey'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/types': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectTypes'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/projects/{projectId}/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getProjectUsage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/public/challenge': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getPublicChallenge'];
    put?: never;
    post?: never;
    delete?: never;
    options: operations['public.challenge.preflight'];
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/public/forms/{key}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['forms.public.schema'];
    put?: never;
    post?: never;
    delete?: never;
    options: operations['forms.preflight.0'];
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/public/forms/{key}/submissions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['forms.public.submit'];
    delete?: never;
    options: operations['forms.preflight.1'];
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/schema/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getConfigSchema'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: never;
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getAuthCapabilities: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Public account-flow availability. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            emailAvailable: boolean;
            /** @enum {number} */
            passwordMinLength: 12;
            /** @enum {string} */
            signupPolicy: 'open' | 'invite_only';
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getPlatformMeta: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Shipped, selected and operational modules. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            modules: {
              displayName: {
                de: string;
                en: string;
              };
              enabled: boolean;
              operational: boolean;
              resourceName: {
                plural: string;
                singular: string;
              };
              type: string;
            }[];
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getOpenApiDocument: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The public API contract. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  listOrganizationActivity: {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
        projectId?: string;
        action?: string;
        actorType?: 'user' | 'api_key' | 'mcp' | 'system';
        actorId?: string;
      };
      header?: never;
      path: {
        organizationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Organization activity without personal labels or network identity. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              action: string;
              actorId: string | null;
              /** @enum {string} */
              actorType: 'user' | 'api_key' | 'mcp' | 'system';
              changes: {
                changedFields?: string[];
                configVersion?: number;
                count?: number;
                instanceId?: string;
                isTest?: boolean;
                preset?: string;
                /** @enum {string} */
                previousRole?: 'owner' | 'admin' | 'member';
                previousVersion?: number;
                reason?: string;
                /** @enum {string} */
                role?: 'owner' | 'admin' | 'member';
                scopes?: string[];
                /** @enum {string} */
                spam?: 'clean' | 'suspect' | 'spam';
                status?: string;
              } | null;
              /** Format: date-time */
              createdAt: string;
              id: string;
              projectId: string | null;
              requestId: string | null;
              targetId: string | null;
              targetType: string | null;
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  listProjects: {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Active projects in the selected organization. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              allowedOrigins: string[];
              /** Format: date-time */
              createdAt: string;
              id: string;
              name: string;
              organizationId: string;
              settings: {
                [key: string]: unknown;
              };
              slug: string;
              /** Format: date-time */
              updatedAt: string;
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  createProject: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** @default [] */
          allowedOrigins?: string[];
          name: string;
          /** @default {} */
          settings?: Record<string, never>;
          slug: string;
        };
      };
    };
    responses: {
      /** @description Project created. */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            allowedOrigins: string[];
            /** Format: date-time */
            createdAt: string;
            id: string;
            name: string;
            organizationId: string;
            settings: {
              [key: string]: unknown;
            };
            slug: string;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Active project configuration. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            allowedOrigins: string[];
            /** Format: date-time */
            createdAt: string;
            id: string;
            name: string;
            organizationId: string;
            settings: {
              [key: string]: unknown;
            };
            slug: string;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  archiveProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Configuration archived and access disabled. This is not personal-data erasure. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  updateProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          allowedOrigins?: string[];
          name?: string;
          settings?: Record<string, never>;
          slug?: string;
        };
      };
    };
    responses: {
      /** @description Project updated. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            allowedOrigins: string[];
            /** Format: date-time */
            createdAt: string;
            id: string;
            name: string;
            organizationId: string;
            settings: {
              [key: string]: unknown;
            };
            slug: string;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  listProjectActivity: {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
        projectId?: string;
        action?: string;
        actorType?: 'user' | 'api_key' | 'mcp' | 'system';
        actorId?: string;
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Project activity. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              action: string;
              actorId: string | null;
              /** @enum {string} */
              actorType: 'user' | 'api_key' | 'mcp' | 'system';
              changes: {
                changedFields?: string[];
                configVersion?: number;
                count?: number;
                instanceId?: string;
                isTest?: boolean;
                preset?: string;
                /** @enum {string} */
                previousRole?: 'owner' | 'admin' | 'member';
                previousVersion?: number;
                reason?: string;
                /** @enum {string} */
                role?: 'owner' | 'admin' | 'member';
                scopes?: string[];
                /** @enum {string} */
                spam?: 'clean' | 'suspect' | 'spam';
                status?: string;
              } | null;
              /** Format: date-time */
              createdAt: string;
              id: string;
              projectId: string | null;
              requestId: string | null;
              targetId: string | null;
              targetType: string | null;
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getProjectConfig: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Configuration only, without credentials, recipients or personal records. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /**
             * @default https://backbricks.app/schema/config.v1.json
             * @enum {string}
             */
            $schema: 'https://backbricks.app/schema/config.v1.json';
            modules: {
              [key: string]: {
                [key: string]: {
                  config: unknown;
                  configVersion?: number;
                  moduleVersion: number;
                  name: string;
                  /**
                   * @default active
                   * @enum {string}
                   */
                  status: 'active' | 'paused';
                };
              };
            };
            project: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  planProjectConfig: {
    parameters: {
      query: {
        dryRun: 'true' | 'false';
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          config: {
            /**
             * @default https://backbricks.app/schema/config.v1.json
             * @enum {string}
             */
            $schema?: 'https://backbricks.app/schema/config.v1.json';
            modules: {
              [key: string]: {
                [key: string]: {
                  config: unknown;
                  configVersion?: number;
                  moduleVersion: number;
                  name: string;
                  /**
                   * @default active
                   * @enum {string}
                   */
                  status?: 'active' | 'paused';
                };
              };
            };
            project: string;
          };
          planHash?: string;
        };
      };
    };
    responses: {
      /** @description Dry run requires config:read. Apply additionally requires config:write and config:destructive when needed, or an admin session. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | {
                changes: {
                  changedPaths: string[];
                  destructive: boolean;
                  key: string;
                  /** @enum {string} */
                  kind: 'create' | 'update' | 'archive';
                  moduleType: string;
                  resource: string;
                }[];
                destructive: boolean;
                /** Format: date-time */
                expiresAt: string;
                planHash: string;
                warnings: string[];
              }
            | {
                /** @enum {boolean} */
                applied: true;
                changes: {
                  changedPaths: string[];
                  destructive: boolean;
                  key: string;
                  /** @enum {string} */
                  kind: 'create' | 'update' | 'archive';
                  moduleType: string;
                  resource: string;
                }[];
                warnings: string[];
              };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.list': {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Active and paused instance configurations. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              config: unknown;
              configVersion: number;
              /** Format: date-time */
              createdAt: string;
              id: string;
              key: string;
              moduleType: string;
              moduleVersion: number;
              name: string;
              organizationId: string;
              projectId: string;
              /** @enum {string} */
              status: 'active' | 'paused' | 'archived';
              storedModuleVersion?: number;
              /** Format: date-time */
              updatedAt: string;
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.create': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          config?: unknown;
          key: string;
          name: string;
          /**
           * @default active
           * @enum {string}
           */
          status?: 'active' | 'paused';
        };
      };
    };
    responses: {
      /** @description Instance created with its initial revision. */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            config: unknown;
            configVersion: number;
            /** Format: date-time */
            createdAt: string;
            id: string;
            key: string;
            moduleType: string;
            moduleVersion: number;
            name: string;
            organizationId: string;
            projectId: string;
            /** @enum {string} */
            status: 'active' | 'paused' | 'archived';
            storedModuleVersion?: number;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.read': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        key: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Instance configuration. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            config: unknown;
            configVersion: number;
            /** Format: date-time */
            createdAt: string;
            id: string;
            key: string;
            moduleType: string;
            moduleVersion: number;
            name: string;
            organizationId: string;
            projectId: string;
            /** @enum {string} */
            status: 'active' | 'paused' | 'archived';
            storedModuleVersion?: number;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.archive': {
    parameters: {
      query: {
        configVersion: number;
      };
      header?: never;
      path: {
        projectId: string;
        key: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Configuration archived, key reserved, revisions retained. Requires config:write and config:destructive; personal records are not erased. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.update': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        key: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          config?: unknown;
          configVersion: number;
          name?: string;
          /** @enum {string} */
          status?: 'active' | 'paused';
        };
      };
    };
    responses: {
      /** @description Configuration merge patch; destructive changes additionally require config:destructive. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            config: unknown;
            configVersion: number;
            /** Format: date-time */
            createdAt: string;
            id: string;
            key: string;
            moduleType: string;
            moduleVersion: number;
            name: string;
            organizationId: string;
            projectId: string;
            /** @enum {string} */
            status: 'active' | 'paused' | 'archived';
            storedModuleVersion?: number;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.export': {
    parameters: {
      query?: {
        status?: 'open' | 'done';
        read?: 'true' | 'false';
        folder?: 'inbox' | 'spam';
        test?: 'true' | 'false';
        from?: string;
        to?: string;
        q?: string;
      };
      header?: never;
      path: {
        key: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description CSV with defused spreadsheet formulas and all historical field columns. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/csv': string;
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.migrate': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        key: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          configVersion: number;
        };
      };
    };
    responses: {
      /** @description Persist the current format with transactional revision and audit. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            config: unknown;
            configVersion: number;
            /** Format: date-time */
            createdAt: string;
            id: string;
            key: string;
            moduleType: string;
            moduleVersion: number;
            name: string;
            organizationId: string;
            projectId: string;
            /** @enum {string} */
            status: 'active' | 'paused' | 'archived';
            storedModuleVersion?: number;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.revisions': {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
      };
      header?: never;
      path: {
        projectId: string;
        key: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Immutable revision history. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              /** @enum {string} */
              actorType: 'user' | 'api_key' | 'mcp' | 'system';
              config?: unknown;
              configVersion: number;
              /** Format: date-time */
              createdAt: string;
              id: string;
              instanceId: string;
              moduleVersion: number;
              organizationId: string;
              projectId: string;
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.revision': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        key: string;
        version: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Stored format and configuration of one revision. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @enum {string} */
            actorType: 'user' | 'api_key' | 'mcp' | 'system';
            config?: unknown;
            configVersion: number;
            /** Format: date-time */
            createdAt: string;
            id: string;
            instanceId: string;
            moduleVersion: number;
            organizationId: string;
            projectId: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.instance.rollback': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        key: string;
        version: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          configVersion: number;
        };
      };
    };
    responses: {
      /** @description New revision restoring the selected historical configuration. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            config: unknown;
            configVersion: number;
            /** Format: date-time */
            createdAt: string;
            id: string;
            key: string;
            moduleType: string;
            moduleVersion: number;
            name: string;
            organizationId: string;
            projectId: string;
            /** @enum {string} */
            status: 'active' | 'paused' | 'archived';
            storedModuleVersion?: number;
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.list': {
    parameters: {
      query?: {
        status?: 'open' | 'done';
        read?: 'true' | 'false';
        folder?: 'inbox' | 'spam';
        test?: 'true' | 'false';
        from?: string;
        to?: string;
        q?: string;
        limit?: number;
        cursor?: string;
      };
      header?: never;
      path: {
        key: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description A bounded page with selected key fields only. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              configVersion: number;
              /** Format: date-time */
              createdAt: string;
              data: {
                [key: string]: unknown;
              };
              id: string;
              isTest: boolean;
              read: boolean;
              /** @enum {string} */
              spamVerdict: 'clean' | 'suspect' | 'spam';
              /** @enum {string} */
              status: 'open' | 'done';
              /** Format: date-time */
              updatedAt: string;
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.bulk': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** @enum {string} */
          action: 'read' | 'unread' | 'done' | 'open' | 'spam' | 'not_spam';
          ids: string[];
        };
      };
    };
    responses: {
      /** @description All selected entries were updated. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            count: number;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.bulk_delete': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          ids: string[];
        };
      };
    };
    responses: {
      /** @description All selected entries were erased. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            count: number;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.delete_all': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          confirm: string;
        };
      };
    };
    responses: {
      /** @description Bounded erasure was queued. */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @enum {boolean} */
            accepted: true;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.read': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
        id: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description An entry with its historical field definitions. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            additionalData: {
              [key: string]: unknown;
            };
            configVersion: number;
            /** Format: date-time */
            createdAt: string;
            data: {
              [key: string]: unknown;
            };
            /** Format: date-time */
            expiresAt: string | null;
            fields: {
              consent?: {
                text: string;
                version: string;
              };
              help?: string;
              key: string;
              label: string;
              max?: number | string;
              maxFiles?: number;
              maxLength?: number;
              min?: number | string;
              minLength?: number;
              options?: {
                label: string;
                value: string;
              }[];
              required: boolean;
              type: string;
            }[];
            id: string;
            isTest: boolean;
            read: boolean;
            source: {
              ipHash?: string;
              origin?: string;
              path?: string;
              uaFamily: string;
            };
            spamReasons: string[];
            /** @enum {string} */
            spamVerdict: 'clean' | 'suspect' | 'spam';
            /** @enum {string} */
            status: 'open' | 'done';
            /** Format: date-time */
            updatedAt: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.delete': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
        id: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The entry was erased. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.submissions.update': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
        id: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          read?: boolean;
          /** @enum {string} */
          spamVerdict?: 'clean' | 'suspect' | 'spam';
          /** @enum {string} */
          status?: 'open' | 'done';
        };
      };
    };
    responses: {
      /** @description The entry was updated. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            id: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.summary': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        key: string;
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Counts only, without personal data. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            spam: number;
            total: number;
            unread: number;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getProjectIntegration: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Safe project metadata and the newest active publishable credential, or null. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /**
             * Format: uri
             * @description API v1 base URL, ending in /v1.
             */
            baseUrl: string;
            modules: {
              displayName: {
                de: string;
                en: string;
              };
              enabled: boolean;
              operational: boolean;
              resourceName: {
                plural: string;
                singular: string;
              };
              type: string;
            }[];
            project: {
              allowedOrigins: string[];
              id: string;
              name: string;
              slug: string;
            };
            publicKey: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  listKeys: {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Key metadata; secret credentials are never redisplayed. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              /** Format: date-time */
              createdAt: string;
              displayPrefix: string;
              /** Format: date-time */
              expiresAt: string | null;
              id: string;
              /** @enum {string} */
              kind: 'publishable' | 'secret';
              /** Format: date-time */
              lastUsedAt: string | null;
              name: string;
              publicToken: string | null;
              /** Format: date-time */
              revokedAt: string | null;
              scopes: string[];
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  createKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json':
          | {
              /** Format: date-time */
              expiresAt: string | null;
              /** @enum {string} */
              kind: 'publishable';
              name: string;
            }
          | {
              /** Format: date-time */
              expiresAt: string | null;
              /** @enum {string} */
              kind: 'secret';
              name: string;
              /** @enum {string} */
              preset: 'agent' | 'server_integration' | 'data_access';
            }
          | {
              /** Format: date-time */
              expiresAt: string | null;
              /** @enum {string} */
              kind: 'secret';
              name: string;
              scopes: (
                | 'integration:read'
                | 'config:read'
                | 'config:write'
                | 'config:destructive'
                | 'project:write'
                | 'test:write'
                | 'stats:read'
                | 'forms:submit'
                | 'uploads:create'
                | 'reviews:submit'
                | 'data:read'
                | 'data:write'
                | 'data:delete'
              )[];
            };
      };
    };
    responses: {
      /** @description The token is revealed only in this creation response. */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: date-time */
            createdAt: string;
            displayPrefix: string;
            /** Format: date-time */
            expiresAt: string | null;
            id: string;
            /** @enum {string} */
            kind: 'publishable' | 'secret';
            /** Format: date-time */
            lastUsedAt: string | null;
            name: string;
            publicToken: string | null;
            /** Format: date-time */
            revokedAt: string | null;
            scopes: string[];
            token: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  revokeKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        keyId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Key revoked. Repeated revocation is a no-op. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getProjectTypes: {
    parameters: {
      query?: {
        lang?: 'ts';
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Generated configuration types. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/plain': string;
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getProjectUsage: {
    parameters: {
      query?: {
        period?: string;
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Monthly aggregate counters serialized as lossless decimal strings. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: {
              metric: string;
              value: string;
            }[];
            /** Format: date */
            period: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getPublicChallenge: {
    parameters: {
      query?: {
        key?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Signed, expiring project-bound proof challenge. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            parameters: {
              /** @enum {string} */
              algorithm: 'SHA-256';
              /** @enum {number} */
              cost: 1000;
              expiresAt: number;
              /** @enum {number} */
              keyLength: 32;
              /** @enum {string} */
              keyPrefix: '00';
              nonce: string;
              salt: string;
            };
            signature: string;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'public.challenge.preflight': {
    parameters: {
      query: {
        key: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Permitted public request preflight. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.public.schema': {
    parameters: {
      query?: {
        key?: string;
      };
      header?: never;
      path: {
        key: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The public form schema. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            fields: {
              consent?: {
                text: string;
                version: string;
              };
              help?: string;
              key: string;
              label: string;
              max?: number | string;
              maxFiles?: number;
              maxLength?: number;
              min?: number | string;
              minLength?: number;
              options?: {
                label: string;
                value: string;
              }[];
              required: boolean;
              type: string;
            }[];
            honeypotField: string;
            key: string;
            proofOfWork: boolean;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.preflight.0': {
    parameters: {
      query: {
        key: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Permitted public request preflight. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  'forms.public.submit': {
    parameters: {
      query?: {
        key?: string;
      };
      header?: {
        'idempotency-key'?: string;
      };
      path: {
        key: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          data: {
            [key: string]: unknown;
          };
          honeypot?: string;
          proof?: unknown;
        };
        'application/x-www-form-urlencoded': {
          [key: string]: string | string[];
        };
      };
    };
    responses: {
      /** @description Accepted. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | {
                id: string;
              }
            | {
                /** @enum {boolean} */
                accepted: true;
              };
        };
      };
      /** @description HTML submission received, or safe error redirect. */
      303: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
          'text/html': string;
        };
      };
    };
  };
  'forms.preflight.1': {
    parameters: {
      query: {
        key: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Permitted public request preflight. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
  getConfigSchema: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Editor schema for selected operational modules. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
      /** @description A structured API error. */
      default: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': {
            code: string;
            detail?: string;
            errors?: {
              code: string;
              message: string;
              meta?: {
                [key: string]: unknown;
              };
              path: string;
            }[];
            hint?: string;
            requestId: string;
            status: number;
            title: string;
            type: string;
          };
        };
      };
    };
  };
}
