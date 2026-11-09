import { expect, test } from 'bun:test';

import { refererPath, userAgentFamily } from './user-agent.ts';

test('request source removes queries, fragments and identifying user agent details', () => {
  expect(refererPath('https://site.test/contact?email=private@example.com#token')).toBe('/contact');
  for (const value of [undefined, '', '/contact', 'javascript:alert(1)', 'file:///private'])
    expect(refererPath(value)).toBeNull();
  expect(refererPath(`https://site.test/${'a'.repeat(1000)}`)?.length).toBe(512);
  expect(userAgentFamily('Mozilla Chrome/142 Safari/537 Edg/142')).toBe('edge');
  expect(userAgentFamily('Mozilla Chrome/142 Safari/537')).toBe('chrome');
  expect(userAgentFamily('Mozilla Safari/537')).toBe('safari');
  expect(userAgentFamily('HeadlessChrome/142')).toBe('bot');
  expect(userAgentFamily('private-device-123')).toBe('other');
});
