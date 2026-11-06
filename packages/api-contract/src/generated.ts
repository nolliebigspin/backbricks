/** Generated from openapi.json. Run bun run api:generate; do not edit. */
export interface paths {
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
