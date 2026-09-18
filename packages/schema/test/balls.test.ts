// Ball shape (ADR-0003).
//
// Identity is the opaque string `id`; `number` and `label` are presentation
// only. Uniqueness of ids and "exactly one cue ball" are semantic rules and
// are deliberately absent from this file — see schema-vs-semantic.test.ts.
import { describe, it } from 'vitest';
import { expectErrorMatching, expectInvalid, expectValid } from './helpers/validate.js';
import { drillWith, withObjectBall } from './helpers/drills.js';

describe('ball shape', () => {
  it.each(['cue', 'object', 'obstacle'])('accepts role %o', (role) => {
    expectValid(withObjectBall({ role }));
  });

  it('rejects the role "marker", which 0.1 does not define', () => {
    const errors = expectInvalid(withObjectBall({ role: 'marker' }));
    expectErrorMatching(errors, { keyword: 'enum', instancePath: '/balls/1/role' });
  });

  it.each(['CUE', 'ghost', 'target', ''])('rejects role %o', (role) => {
    expectErrorMatching(expectInvalid(withObjectBall({ role })), {
      keyword: 'enum',
      instancePath: '/balls/1/role',
    });
  });

  it('rejects a non-string role', () => {
    expectErrorMatching(expectInvalid(withObjectBall({ role: 2 })), {
      keyword: 'type',
      instancePath: '/balls/1/role',
    });
  });

  it.each([[7], [null], [true], [['b1']], [{ value: 'b1' }]])(
    'rejects a non-string ball id %o',
    (id) => {
      expectErrorMatching(expectInvalid(withObjectBall({ id })), {
        keyword: 'type',
        instancePath: '/balls/1/id',
      });
    },
  );

  it.each([
    ['a string', '0.5,0.25'],
    ['null', null],
    ['a number', 0.5],
    ['an array', [0.5, 0.25]],
    ['an empty object', {}],
    ['a boolean', true],
  ])('rejects a malformed `at`: %s', (_label, at) => {
    expectErrorMatching(expectInvalid(withObjectBall({ at })), {
      keyword: 'oneOf',
      instancePath: '/balls/1/at',
    });
  });

  it('rejects a non-array balls value', () => {
    expectErrorMatching(expectInvalid(drillWith({ balls: {} })), {
      keyword: 'type',
      instancePath: '/balls',
    });
  });

  it('rejects a non-object ball entry', () => {
    expectErrorMatching(expectInvalid(drillWith({ balls: ['cue'] })), {
      keyword: 'type',
      instancePath: '/balls/0',
    });
  });

  it('accepts optional number and label, and a ball with neither', () => {
    expectValid(withObjectBall({ number: 9, label: 'nine' }));
    expectValid(withObjectBall({ label: 'blocker' }));
  });

  it('rejects a non-integer ball number', () => {
    expectErrorMatching(expectInvalid(withObjectBall({ number: 1.5 })), {
      keyword: 'type',
      instancePath: '/balls/1/number',
    });
    expectErrorMatching(expectInvalid(withObjectBall({ number: '1' })), {
      keyword: 'type',
      instancePath: '/balls/1/number',
    });
  });

  it('rejects a non-string label', () => {
    expectErrorMatching(expectInvalid(withObjectBall({ label: 9 })), {
      keyword: 'type',
      instancePath: '/balls/1/label',
    });
  });
});
