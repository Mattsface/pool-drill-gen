// Shot shape (ADR-0002, ADR-0008, ADR-0009).
//
// `type` is the explicit discriminator and 0.1 defines exactly one value.
// Bank, kick, rail paths, spin and speed are not pre-declared here: whether
// they belong in `type` or elsewhere is a question for the M2 corpus.
import { describe, it } from 'vitest';
import { expectErrorMatching, expectInvalid, expectValid } from './helpers/validate.js';
import { drillWith, withShot, withShotExactly, OBJECT_BALL_ID } from './helpers/drills.js';

const POCKETS = [
  'head_left',
  'head_right',
  'side_left',
  'side_right',
  'foot_left',
  'foot_right',
] as const;

describe('shot type', () => {
  it('accepts type "pot"', () => {
    expectValid(withShot({ type: 'pot' }));
  });

  it.each(['bank', 'kick', 'safety', 'carom', 'combination', 'POT', ''])(
    'rejects the unsupported shot type %o',
    (type) => {
      expectErrorMatching(expectInvalid(withShot({ type })), {
        keyword: 'const',
        instancePath: '/shots/0/type',
      });
    },
  );

  it('rejects a non-string shot type', () => {
    expectErrorMatching(expectInvalid(withShot({ type: 1 })), {
      keyword: 'type',
      instancePath: '/shots/0/type',
    });
  });
});

describe('shot pocket', () => {
  it('requires pocket when type is "pot"', () => {
    const errors = expectInvalid(
      withShotExactly({ n: 1, type: 'pot', ballId: OBJECT_BALL_ID }),
    );
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/shots/0',
      missingProperty: 'pocket',
    });
  });

  it.each(POCKETS)('accepts the table-intrinsic pocket %s', (pocket) => {
    expectValid(withShot({ pocket }));
  });

  // ADR-0002: pocket names are table-intrinsic. The word "top" encodes a
  // screen position and must not appear anywhere in this format.
  it.each(['top_left', 'top_right', 'bottom_left', 'corner', 'left', 'side', 'FOOT_LEFT', ''])(
    'rejects the pocket name %o',
    (pocket) => {
      expectErrorMatching(expectInvalid(withShot({ pocket })), {
        keyword: 'enum',
        instancePath: '/shots/0/pocket',
      });
    },
  );

  it('rejects a non-string pocket', () => {
    expectErrorMatching(expectInvalid(withShot({ pocket: 3 })), {
      keyword: 'type',
      instancePath: '/shots/0/pocket',
    });
  });
});

describe('shot cueBallTarget', () => {
  // ADR-0008: a position goal is always a region, never a single point —
  // nobody lands the cue ball on a coordinate.
  it('rejects a bare point as a cue-ball target', () => {
    const errors = expectInvalid(withShot({ cueBallTarget: { x: 0.4, y: 0.25 } }));
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: '/shots/0/cueBallTarget' });
  });

  it('accepts a circle region as a cue-ball target', () => {
    expectValid(
      withShot({
        cueBallTarget: { shape: 'circle', center: { x: 0.4, y: 0.25 }, radius: 0.07 },
      }),
    );
  });

  it('accepts a rect region as a cue-ball target', () => {
    expectValid(
      withShot({
        cueBallTarget: {
          shape: 'rect',
          min: { x: 0.2, y: 0.1 },
          max: { x: 0.45, y: 0.4 },
        },
      }),
    );
  });

  it('rejects a malformed region as a cue-ball target', () => {
    for (const cueBallTarget of [
      { shape: 'circle', center: { x: 0.4, y: 0.25 } },
      { shape: 'circle', center: { x: 0.4, y: 0.25 }, radius: 0 },
      { shape: 'rect', min: { x: 0.2, y: 0.1 } },
      { shape: 'rect', x: 0.2, y: 0.1, w: 0.2, h: 0.2 },
      { shape: 'blob', center: { x: 0.4, y: 0.25 }, radius: 0.07 },
      {},
    ]) {
      expectErrorMatching(expectInvalid(withShot({ cueBallTarget })), {
        keyword: 'oneOf',
        instancePath: '/shots/0/cueBallTarget',
      });
    }
  });
});

describe('shot n and ballId', () => {
  it('accepts an integer n of 1 or more', () => {
    expectValid(withShot({ n: 1 }));
    expectValid(withShot({ n: 42 }));
  });

  it.each([[0], [-1]])('rejects n = %o', (n) => {
    expectErrorMatching(expectInvalid(withShot({ n })), {
      keyword: 'minimum',
      instancePath: '/shots/0/n',
    });
  });

  it.each([[1.5], ['1'], [null]])('rejects a non-integer n of %o', (n) => {
    expectErrorMatching(expectInvalid(withShot({ n })), {
      keyword: 'type',
      instancePath: '/shots/0/n',
    });
  });

  it('rejects a non-string ballId', () => {
    expectErrorMatching(expectInvalid(withShot({ ballId: 1 })), {
      keyword: 'type',
      instancePath: '/shots/0/ballId',
    });
  });

  it('rejects a non-string note', () => {
    expectErrorMatching(expectInvalid(withShot({ note: ['draw'] })), {
      keyword: 'type',
      instancePath: '/shots/0/note',
    });
  });

  it('rejects a non-object shot entry', () => {
    expectErrorMatching(expectInvalid(drillWith({ shots: ['pot the one'] })), {
      keyword: 'type',
      instancePath: '/shots/0',
    });
  });
});

describe('sequencing', () => {
  it.each(['strict', 'any_order', 'single_shot'])('accepts sequencing %s', (sequencing) => {
    expectValid(drillWith({ sequencing }));
  });

  it.each(['sequential', 'ordered', 'STRICT', 'progressive', ''])(
    'rejects sequencing %o',
    (sequencing) => {
      expectErrorMatching(expectInvalid(drillWith({ sequencing })), {
        keyword: 'enum',
        instancePath: '/sequencing',
      });
    },
  );
});
