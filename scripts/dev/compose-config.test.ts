import { expect, test } from 'bun:test';

import { readComposeConfig } from './compose-config.ts';
test('Compose passes the selected scanner and its internal address to every application role', async () => {
  const [scanned, unscanned] = await Promise.all([
    readComposeConfig({ SCANNER: 'clamav' }),
    readComposeConfig({ SCANNER: 'none' }),
  ]);
  for (const [mode, config] of Object.entries({ clamav: scanned, none: unscanned })) {
    const port = config.services['clamav']?.ports[0]?.target;
    if (port === undefined) throw new Error('Missing scanner port.');
    for (const name of ['migrate', 'server', 'worker']) {
      const service = config.services[name];
      if (!service) throw new Error('Missing app role.');
      expect(service.environment['SCANNER']).toBe(mode);
      expect(service.environment['CLAMAV_HOST']).toBe('clamav');
      expect(Number(service.environment['CLAMAV_PORT'])).toBe(port);
    }
  }
}, 15000);
