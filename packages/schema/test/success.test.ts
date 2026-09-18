// Success criteria (ADR-0009).
//
// Two modes: `run_all`, and `count` with `attempts` and `target`. The
// conditional requirement is expressed with if/then, the same mechanism
// that requires `pocket` on a `pot` shot. `target <= attempts` is a
// cross-field rule and belongs to core — see schema-vs-semantic.test.ts.
import { describe, it } from 'vitest';
import { expectErrorMatching, expectInvalid, expectValid } from './helpers/validate.js';
import { withSuccess } from './helpers/drills.js';

describe('success mode run_all', () => {
  it('accepts run_all with neither attempts nor target', () => {
    expectValid(withSuccess({ mode: 'run_all' }));
  });
});

describe('success mode count', () => {
  it('accepts count with attempts and target', () => {
    expectValid(withSuccess({ mode: 'count', attempts: 10, target: 7 }));
  });

  it('rejects count without attempts', () => {
    const errors = expectInvalid(withSuccess({ mode: 'count', target: 7 }));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/success',
      missingProperty: 'attempts',
    });
  });

  it('rejects count without target', () => {
    const errors = expectInvalid(withSuccess({ mode: 'count', attempts: 10 }));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/success',
      missingProperty: 'target',
    });
  });

  it('rejects count with neither attempts nor target', () => {
    const errors = expectInvalid(withSuccess({ mode: 'count' }));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/success',
      missingProperty: 'attempts',
    });
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/success',
      missingProperty: 'target',
    });
  });
});

describe('success field constraints', () => {
  it.each(['streak', 'ladder', 'progressive', 'RUN_ALL', 'run-all', ''])(
    'rejects the success mode %o',
    (mode) => {
      expectErrorMatching(expectInvalid(withSuccess({ mode })), {
        keyword: 'enum',
        instancePath: '/success/mode',
      });
    },
  );

  it('rejects a non-string success mode', () => {
    expectErrorMatching(expectInvalid(withSuccess({ mode: 1 })), {
      keyword: 'type',
      instancePath: '/success/mode',
    });
  });

  it('rejects attempts or target below 1', () => {
    expectErrorMatching(expectInvalid(withSuccess({ mode: 'count', attempts: 0, target: 0 })), {
      keyword: 'minimum',
      instancePath: '/success/attempts',
    });
    expectErrorMatching(expectInvalid(withSuccess({ mode: 'count', attempts: 10, target: 0 })), {
      keyword: 'minimum',
      instancePath: '/success/target',
    });
  });

  it('rejects non-integer attempts or target', () => {
    expectErrorMatching(
      expectInvalid(withSuccess({ mode: 'count', attempts: 10.5, target: 7 })),
      { keyword: 'type', instancePath: '/success/attempts' },
    );
    expectErrorMatching(
      expectInvalid(withSuccess({ mode: 'count', attempts: 10, target: '7' })),
      { keyword: 'type', instancePath: '/success/target' },
    );
  });

  it('rejects a non-object success', () => {
    expectErrorMatching(expectInvalid(withSuccess('run_all')), {
      keyword: 'type',
      instancePath: '/success',
    });
  });
});
