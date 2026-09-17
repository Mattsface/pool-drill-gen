// `format` and `formatVersion` (ADR-0001).
//
// 0.x offers no compatibility promise in either direction, so the schema
// pins the exact version with `const`. There is deliberately no
// version-range or comparison logic anywhere: a 0.1 reader accepts 0.1 and
// nothing else.
import { describe, it } from 'vitest';
import { expectErrorMatching, expectInvalid, expectValid } from './helpers/validate.js';
import { drillWith } from './helpers/drills.js';

describe('format and formatVersion', () => {
  it('accepts exactly formatVersion "0.1"', () => {
    expectValid(drillWith({ formatVersion: '0.1' }));
  });

  it('rejects a numeric formatVersion', () => {
    const errors = expectInvalid(drillWith({ formatVersion: 0.1 }));
    expectErrorMatching(errors, { keyword: 'type', instancePath: '/formatVersion' });
  });

  it.each(['0.2', '1.0', '0.10', '0.1.0', 'v0.1', '0.1 ', ''])(
    'rejects formatVersion %o',
    (formatVersion) => {
      const errors = expectInvalid(drillWith({ formatVersion }));
      expectErrorMatching(errors, { keyword: 'const', instancePath: '/formatVersion' });
    },
  );

  it('accepts exactly format "pool-drill"', () => {
    expectValid(drillWith({ format: 'pool-drill' }));
  });

  it.each(['pool-drill-gen', 'pooldrill', 'drill', 'POOL-DRILL', ''])(
    'rejects format %o',
    (format) => {
      const errors = expectInvalid(drillWith({ format }));
      expectErrorMatching(errors, { keyword: 'const', instancePath: '/format' });
    },
  );

  it('rejects a non-string format', () => {
    const errors = expectInvalid(drillWith({ format: 1 }));
    expectErrorMatching(errors, { keyword: 'type', instancePath: '/format' });
  });
});
