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

  test('keeps harmless primitive text and projects errors safely', () => {
    const error = new Error('boom');
    expect(redactSecrets('bb_sk_plain')).toBe('bb_sk_plain');
    expect(redactSecrets(error)).toMatchObject({ type: 'Error', message: 'boom' });
  });
});

test('key-shaped values are masked in text, error chains, property names and deeply nested values', () => {
  const secret = `bb_sk_${'A'.repeat(32)}`;
  const cause = new Error(`provider rejected ${secret}`);
  const error = new Error(`request used ${secret}`, { cause });
  const deep = Array.from({ length: 15 }).reduce<unknown>((value) => ({ nested: value }), {
    label: secret,
  });
  const result = JSON.stringify(redactSecrets({ trace: secret, error, deep, [secret]: 'value' }));
  expect(result).not.toContain(secret);
  expect(result).toContain('[redacted]');
  expect(redactSecrets(`Bearer ${secret}`)).toBe('Bearer [redacted]');
});
