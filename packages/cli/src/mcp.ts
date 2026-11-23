import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { apply, plan } from './configuration.ts';
import { CliError, redact } from './errors.ts';
import schema from './generated/config-schema.json' with { type: 'json' };
import { integrationGuide } from './integration-guide.ts';
import {
  integration,
  management,
  projectTypes,
  responseData,
  scope,
  testSubmit,
} from './management.ts';
import { currentConfig, frameworks } from './project-files.ts';
import type { Target } from './target.ts';
import { validateConfig, validInstanceKey } from './validation.ts';

const objectInput = z.record(z.string(), z.unknown());
const keyInput = z.string().refine(validInstanceKey, 'Use a valid Backbricks instance key.');

type Resource = keyof typeof schema.properties.modules.properties;

function result(value: object) {
  const text = redact(JSON.stringify(value));
  return { content: [{ type: 'text' as const, text }] };
}

async function tool(run: () => Promise<object>) {
  try {
    return result(await run());
  } catch (error) {
    const details =
      error instanceof CliError
        ? { code: error.code, message: error.message, ...error.details }
        : { code: 'operation_failed', message: 'The Backbricks operation failed.' };
    return { ...result(details), isError: true };
  }
}

export async function startMcp(target: Target) {
  const server = new McpServer({ name: 'backbricks', version: '0.4.0' });
  server.registerTool(
    'project_info',
    { description: 'Read the linked project and public integration settings.' },
    () => tool(() => integration(target)),
  );
  server.registerTool('config_get', { description: 'Read the linked project configuration.' }, () =>
    tool(() => currentConfig(target)),
  );
  server.registerTool(
    'config_plan',
    {
      description: 'Plan configuration changes without writing. Retain the returned planHash.',
      inputSchema: { config: objectInput },
    },
    ({ config }) => tool(() => plan(target, validateConfig(config))),
  );
  server.registerTool(
    'config_apply',
    {
      description: 'Apply the exact configuration with the previously returned planHash.',
      inputSchema: {
        config: objectInput,
        planHash: z.string().min(1).max(1024),
        allowDestructive: z.boolean().optional(),
      },
    },
    ({ config, planHash, allowDestructive }) =>
      tool(async () => {
        const input = validateConfig(config);
        if (!allowDestructive) {
          const inspection = await plan(target, input);
          if (inspection.destructive)
            throw new CliError(
              'destructive_plan',
              'Obtain approval before allowing a destructive plan.',
            );
        }
        return apply(target, input, planHash, 'mcp');
      }),
  );

  const upserts = {
    form_upsert: 'forms',
    upload_zone_upsert: 'upload-zones',
    review_collection_upsert: 'review-collections',
  } as const satisfies Record<string, Resource>;
  for (const [name, resource] of Object.entries(upserts)) {
    server.registerTool(
      name,
      {
        description: `Plan and apply a single non-destructive ${resource} change.`,
        inputSchema: { key: keyInput, name: z.string().min(1).max(200), config: objectInput },
      },
      (input) =>
        tool(async () => {
          const remote = await currentConfig(target);
          const siblings = remote.modules[resource] ?? {};
          const previous = Object.hasOwn(siblings, input.key) ? siblings[input.key] : undefined;
          const moduleVersion =
            schema.properties.modules.properties[resource].additionalProperties.properties
              .moduleVersion.const;
          const config = validateConfig({
            ...remote,
            modules: {
              [resource]: {
                ...siblings,
                [input.key]: { ...previous, name: input.name, moduleVersion, config: input.config },
              },
            },
          });
          const inspection = await plan(target, config);
          if (inspection.destructive)
            throw new CliError(
              'destructive_plan',
              'Use config_plan and obtain approval before applying this change.',
            );
          return apply(target, config, inspection.planHash, 'mcp');
        }),
    );
  }

  server.registerTool(
    'types_generate',
    { description: 'Return TypeScript declarations for the linked project.' },
    () => tool(async () => ({ types: await projectTypes(target) })),
  );
  server.registerTool(
    'integration_guide',
    {
      description: 'Return the integration guide and verify integration access.',
      inputSchema: { framework: z.enum(frameworks).optional() },
    },
    ({ framework }) =>
      tool(async () => {
        await integration(target);
        return { markdown: integrationGuide(framework) };
      }),
  );
  server.registerTool(
    'origins_add',
    {
      description:
        'Add an exact HTTP(S) origin to the project allowlist. Requires the project:write scope.',
      inputSchema: { origin: z.string().min(1).max(2048) },
    },
    ({ origin }) =>
      tool(async () => {
        const api = await management(target);
        return responseData(
          await api.POST('/v1/projects/{projectId}/mcp/origins', {
            params: scope(target),
            body: { origin },
          }),
        );
      }),
  );
  server.registerTool(
    'test_submit',
    {
      description:
        'Create a flagged test form entry using synthetic data. Required file checks are skipped.',
      inputSchema: { key: keyInput, data: objectInput },
    },
    ({ key, data }) => tool(() => testSubmit(target, key, data, 'mcp')),
  );
  server.registerTool(
    'stats_get',
    {
      description: 'Read aggregate project usage without personal data.',
      inputSchema: {
        period: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      },
    },
    ({ period }) =>
      tool(async () => {
        const api = await management(target);
        return responseData(
          await api.GET('/v1/projects/{projectId}/usage', {
            params: { ...scope(target), query: { period } },
          }),
        );
      }),
  );

  await server.connect(new StdioServerTransport());
}
