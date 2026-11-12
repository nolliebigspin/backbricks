import { expect, test } from 'bun:test';

import { formEnvelope } from './form-envelope.ts';

test('flat fields preserve repeated values and decode the ALTCHA base64 JSON payload', () => {
  const proof = { challenge: { signature: 'fixture' }, solution: { counter: 1 } };
  const data = new URLSearchParams([
    ['name', 'Ada & Co'],
    ['tags', 'one'],
    ['tags', 'two'],
    ['altcha', btoa(JSON.stringify(proof))],
    ['__proto__', 'safe'],
  ]);
  const parsed = formEnvelope(new TextEncoder().encode(data.toString()));
  expect(parsed.data).toEqual(
    JSON.parse('{"name":"Ada & Co","tags":["one","two"],"__proto__":"safe"}'),
  );
  expect(parsed.proof).toEqual(proof);
  expect(Object.getPrototypeOf(parsed.data)).toBe(Object.prototype);
  expect(formEnvelope(new TextEncoder().encode('altcha=%25'))).toEqual({ data: {}, proof: null });
  expect(formEnvelope(new TextEncoder().encode('altcha=a&altcha=b'))).toEqual({
    data: {},
    proof: null,
  });
});
