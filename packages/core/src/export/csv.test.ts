import { expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { csvRow } from './csv.ts';

// Independent single-record RFC 4180 parser used only as an encoder oracle.
function parseRecord(csv: string) {
  const fields: string[] = [];
  let field = '',
    quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && char === ',') {
      fields.push(field);
      field = '';
    } else if (!quoted && char === '\r' && csv[index + 1] === '\n') {
      fields.push(field);
      return fields;
    } else field += char;
  }
  throw new Error('Incomplete CSV record');
}

test('CSV protects spreadsheet formulas and quotes separators, Unicode and line breaks', () => {
  expect(csvRow(['=SUM(1)', '+cmd', '-cmd', '@cmd', '\tcmd', '\rcmd'])).toBe(
    "'=SUM(1),'+cmd,'-cmd,'@cmd,'\tcmd,\"'\rcmd\"\r\n",
  );
  expect(parseRecord(csvRow(['one,two', '"quoted"', 'line\r\nbreak', 'Grüße 🧱']))).toEqual([
    'one,two',
    '"quoted"',
    'line\r\nbreak',
    'Grüße 🧱',
  ]);
  fc.assert(
    fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 20 }), (fields) => {
      const expected = fields.map((value) =>
        ['=', '+', '-', '@', '\t', '\r'].includes(value.charAt(0)) ? "'" + value : value,
      );
      expect(parseRecord(csvRow(fields))).toEqual(expected);
    }),
  );
});
