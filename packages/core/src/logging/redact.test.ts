import { describe, expect, test } from 'bun:test';

import { REDACTED, redactSecrets } from './redact.ts';

describe('redactSecrets', () => {
  test('masks secret-looking fields at any depth and keeps the rest', () => {
    const input = {
      method: 'POST',
      headers: { authorization: 'Bearer bb_sk_abc', cookie: 'session=1', 'content-type': 'json' },
      body: { password: 'hunter2', nested: [{ token: 't', apiKey: 'k', secret_key: 's' }] },
      keyId: 'key_01h455vb4pex5vsknk084sn02q',
      accessKeyId: 'GK123',
    };
    expect(redactSecrets(input)).toEqual({
      method: 'POST',
      headers: { authorization: REDACTED, cookie: REDACTED, 'content-type': 'json' },
      body: {
        password: REDACTED,
        nested: [{ token: REDACTED, apiKey: REDACTED, secret_key: REDACTED }],
      },
      keyId: 'key_01h455vb4pex5vsknk084sn02q',
      accessKeyId: 'GK123',
    });
  });

  test('leaves primitives and errors alone', () => {
    const error = new Error('boom');
    expect(redactSecrets('bb_sk_plain')).toBe('bb_sk_plain');
    expect(redactSecrets(error)).toBe(error);
  });
});
