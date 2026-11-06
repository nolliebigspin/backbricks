import { describe, expect, test } from 'bun:test';

import * as fc from 'fast-check';

import { createIds, ID_PREFIXES, isTypeId, parseTypeId } from './type-id.ts';

const fixedClock = (milliseconds: number) => ({ now: () => new Date(milliseconds) });

describe('TypeIDs', () => {
  test('matches the TypeID spec test vectors', () => {
    // https://github.com/jetify-com/typeid/blob/main/spec/valid.yml
    expect(parseTypeId('rev_00000000000000000000000000')?.uuid).toBe(
      '00000000-0000-0000-0000-000000000000',
    );
    expect(parseTypeId('rev_00000000000000000000000001')?.uuid).toBe(
      '00000000-0000-0000-0000-000000000001',
    );
    expect(parseTypeId('rev_01h455vb4pex5vsknk084sn02q')?.uuid).toBe(
      '01890a5d-ac96-774b-bcce-b302099a8057',
    );
  });

  test('generates a UUIDv7 with the clock time and the given prefix', () => {
    const ids = createIds(fixedClock(Date.UTC(2026, 10, 5)), (bytes) => bytes.fill(0xff));
    const id = ids.generate('sub');
    expect(id).toMatch(/^sub_[0-7][0-9a-hjkmnp-tv-z]{25}$/);
    const uuid = parseTypeId(id)?.uuid ?? '';
    expect(uuid.charAt(14)).toBe('7'); // version
    expect(uuid.charAt(19)).toMatch(/^[89ab]$/); // variant
    expect(Number.parseInt(uuid.replaceAll('-', '').slice(0, 12), 16)).toBe(Date.UTC(2026, 10, 5));
  });

  test('ids from later milliseconds sort after earlier ones', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 47 }),
        fc.integer({ min: 1, max: 2 ** 20 }),
        fc.constantFrom(...ID_PREFIXES),
        (earlier, gap, prefix) => {
          const first = createIds(fixedClock(earlier)).generate(prefix);
          const second = createIds(fixedClock(earlier + gap)).generate(prefix);
          expect(first < second).toBe(true);
          expect(parseTypeId(first)?.prefix).toBe(prefix);
        },
      ),
    );
  });

  test('rejects foreign prefixes and malformed suffixes', () => {
    expect(parseTypeId('usr_01h455vb4pex5vsknk084sn02q')).toBeNull();
    expect(parseTypeId('sub_81h455vb4pex5vsknk084sn02q')).toBeNull(); // overflows 128 bits
    expect(parseTypeId('sub_01h455vb4pex5vsknk084sn02')).toBeNull();
    expect(parseTypeId('sub_01h455vb4pex5vsknk084sn0iu')).toBeNull(); // i/u aren't base32
    expect(isTypeId('sub_01h455vb4pex5vsknk084sn02q', 'sub')).toBe(true);
    expect(isTypeId('sub_01h455vb4pex5vsknk084sn02q', 'rev')).toBe(false);
    expect(isTypeId(42, 'sub')).toBe(false);
  });

  test('rejects trailing line terminators instead of decoding them as base32', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ID_PREFIXES),
        fc.constantFrom('\n', '\r', '\r\n', '\u2028', '\u2029'),
        (prefix, ending) => {
          const input = `${prefix}_01h455vb4pex5vsknk084sn02q${ending}`;
          expect(parseTypeId(input)).toBeNull();
          expect(isTypeId(input, prefix)).toBe(false);
        },
      ),
    );
  });
});
