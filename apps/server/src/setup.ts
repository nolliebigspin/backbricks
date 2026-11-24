// SPDX-License-Identifier: AGPL-3.0-only

import { bindAuthDatabase, createSetupOwner, setupOwnerSchema } from '@backbricks/auth';
import { systemClock, type Config } from '@backbricks/core';
import {
  authSchema,
  completeInstanceSetup,
  createDatabase,
  createAuthReplayStore,
  createOrganizationIdentityStore,
  createWithTenant,
} from '@backbricks/db';

import { serverAuthOptions } from './auth.ts';
import type { Logger } from './logger.ts';
import { createServerServices } from './services.ts';

const inputLimit = 4096;

async function readSetupInput() {
  let input = '';
  const stream = Bun.stdin.stream().pipeThrough(new TextDecoderStream());
  for await (const chunk of stream) {
    input += chunk;
    if (input.length > inputLimit) throw new Error('Setup input exceeds its limit.');
  }
  return setupOwnerSchema.parse(JSON.parse(input));
}

/** Provision a verified owner without enabling public self-registration or adding an HTTP bypass. */
export async function setupInstance(config: Config, log: Logger): Promise<void> {
  if (config.deploymentMode !== 'self_hosted' || config.signupPolicy !== 'invite_only')
    throw new Error('Setup requires a self-hosted deployment with invite-only signup.');
  const input = await readSetupInput();
  const database = createDatabase(config.databaseUrl, { applicationName: 'backbricks-setup' });
  const services = createServerServices(config, database.db);
  try {
    const options = serverAuthOptions(config, database.db, log, services);
    const created = await completeInstanceSetup(database.db, systemClock.now(), (tx) =>
      createSetupOwner(
        options,
        {
          database: bindAuthDatabase(tx, authSchema),
          replay: createAuthReplayStore(tx),
          identity: createOrganizationIdentityStore(tx),
          withTenant: createWithTenant(tx),
        },
        input,
      ),
    );
    if (!created) throw new Error('Setup has already completed.');
    log.info('First dashboard owner created. Continue in the dashboard.');
  } finally {
    await services.close();
    await database.close();
  }
}
