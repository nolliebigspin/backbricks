import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import { createTestDatabase } from '../test/database.ts';
import { eventually } from '../test/eventually.ts';

const execute = promisify(execFile);
const docker = async (...args: string[]) =>
  (await execute('docker', args, { maxBuffer: 1024 * 1024 })).stdout.trim();
const image = process.argv[2] ?? 'backbricks/server:m1';
const suffix = crypto.randomUUID().slice(0, 8);
const serve = `bb-image-serve-${suffix}`;
const worker = `bb-image-worker-${suffix}`;
const database = await createTestDatabase();
const url = new URL(database.url);
url.hostname = 'postgres';
url.port = '';
const composition = z
  .object({ name: z.string() })
  .parse(JSON.parse(await docker('compose', 'config', '--format', 'json')));
const options = [
  '--read-only',
  '--tmpfs',
  '/tmp',
  '--network',
  `${composition.name}_default`,
  '-e',
  `DATABASE_URL=${url.href}`,
  '-e',
  'PUBLIC_URL=https://ci.backbricks.invalid',
  '-e',
  'APP_SECRET=ci-secret-ci-secret-ci-secret-ci-secret-0',
  '-e',
  'BACKBRICKS_MODULES=forms',
];

// Execute inside the shipped image: the host does not consume the queue for this assertion.
const queueProbe = `
import { PgBoss } from 'pg-boss';
const boss=new PgBoss(process.env.DATABASE_URL);
await boss.start();
try {
  const name='core.maintenance.cleanup';
  let id;
  const deadline=performance.now()+10000;
  while(!id && performance.now()<deadline){id=await boss.send(name,{});if(!id)await Bun.sleep(100);}
  if(!id)throw new Error('No cleanup job was admitted');
  let complete=false;
  while(performance.now()<deadline){
    const job=await boss.getJobById(name,id);
    if(job?.state==='completed'){complete=true;break;}
    if(job?.state==='failed')throw new Error('Image worker failed the cleanup job');
    await Bun.sleep(100);
  }
  if(!complete)throw new Error('Image worker did not consume its cleanup job');
} finally {await boss.stop();}
`;
try {
  await docker('run', '--rm', ...options, image, 'migrate');
  await docker('run', '-d', '--name', serve, '-p', '127.0.0.1::3000', ...options, image, 'serve');
  const mapping = await docker('port', serve, '3000/tcp');
  const port = /:(\d+)$/.exec(mapping)?.[1];
  if (!port) throw new Error('Missing image HTTP port');
  const origin = `http://127.0.0.1:${port}`;
  await eventually(
    async () =>
      fetch(`${origin}/readyz`)
        .then((response) => response.ok)
        .catch(() => false),
    30000,
  );
  if (!(await fetch(`${origin}/healthz`)).ok) throw new Error('Image health failed');
  if (!(await (await fetch(origin)).text()).includes('<div id="root">'))
    throw new Error('Image dashboard missing');
  await docker('run', '-d', '--name', worker, ...options, image, 'worker');
  await eventually(async () => (await docker('logs', worker)).includes('worker ready'), 10000);
  for (const name of [serve, worker]) {
    // oxlint-disable-next-line no-await-in-loop -- Verify each independently running role.
    if ((await docker('exec', name, 'id', '-u')) === '0') throw new Error('Image role ran as root');
  }
  await docker('exec', '-w', '/app/packages/db', worker, 'bun', '--no-env-file', '-e', queueProbe);
  await docker('stop', '-t', '75', serve, worker);
  for (const name of [serve, worker]) {
    // oxlint-disable-next-line no-await-in-loop -- Every role must drain and exit successfully.
    if ((await docker('inspect', name, '--format', '{{.State.ExitCode}}')) !== '0')
      throw new Error('Image role did not stop cleanly');
  }
  process.stdout.write(
    'Image smoke passed: migrate, private non-root serve/dashboard, worker cleanup consumption and graceful shutdown.\n',
  );
} finally {
  await Promise.all([serve, worker].map((name) => docker('rm', '-f', name).catch(() => '')));
  await database.drop();
}
