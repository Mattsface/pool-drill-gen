// Placement: point, circle region, rect region (ADR-0008).
//
// `Placement := Point | Region`, discriminated by the presence of `shape`.
// Regions use `shape` and not `type`, because `type` is already the shot
// discriminator.
//
// Everything here is shape only. Whether a point is inside the playing
// surface, and whether a rectangle's min is actually below its max, are
// semantic rules checked in core.
import { describe, it } from 'vitest';
import { expectErrorMatching, expectInvalid, expectValid } from './helpers/validate.js';
import { withObjectBallAt } from './helpers/drills.js';

const AT_PATH = '/balls/1/at';

describe('placement — point', () => {
  it('accepts an exact point', () => {
    expectValid(withObjectBallAt({ x: 0.75, y: 0.25 }));
  });

  it('accepts a point at the coordinate-space extremes', () => {
    expectValid(withObjectBallAt({ x: 0, y: 0 }));
    expectValid(withObjectBallAt({ x: 1, y: 0.5 }));
  });

  it('rejects a point missing x', () => {
    const errors = expectInvalid(withObjectBallAt({ y: 0.25 }));
    expectErrorMatching(errors, { keyword: 'required', missingProperty: 'x' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('rejects a point missing y', () => {
    const errors = expectInvalid(withObjectBallAt({ x: 0.75 }));
    expectErrorMatching(errors, { keyword: 'required', missingProperty: 'y' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it.each([
    ['a string x', { x: '0.75', y: 0.25 }],
    ['a string y', { x: 0.75, y: '0.25' }],
    ['a null x', { x: null, y: 0.25 }],
    ['an array pair', { x: [0.75], y: 0.25 }],
  ])('rejects a point with %s', (_label, at) => {
    expectErrorMatching(expectInvalid(withObjectBallAt(at)), {
      keyword: 'oneOf',
      instancePath: AT_PATH,
    });
  });
});

describe('placement — circle region', () => {
  it('accepts a circle region', () => {
    expectValid(
      withObjectBallAt({ shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: 0.05 }),
    );
  });

  it('rejects a circle missing center', () => {
    const errors = expectInvalid(withObjectBallAt({ shape: 'circle', radius: 0.05 }));
    expectErrorMatching(errors, { keyword: 'required', missingProperty: 'center' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('rejects a circle missing radius', () => {
    const errors = expectInvalid(
      withObjectBallAt({ shape: 'circle', center: { x: 0.5, y: 0.25 } }),
    );
    expectErrorMatching(errors, { keyword: 'required', missingProperty: 'radius' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('rejects radius 0 — a region with no area is not a placement', () => {
    const errors = expectInvalid(
      withObjectBallAt({ shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: 0 }),
    );
    expectErrorMatching(errors, { keyword: 'exclusiveMinimum' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('rejects a negative radius', () => {
    expectErrorMatching(
      expectInvalid(
        withObjectBallAt({ shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: -0.05 }),
      ),
      { keyword: 'exclusiveMinimum' },
    );
  });

  it('rejects a non-numeric radius', () => {
    expectErrorMatching(
      expectInvalid(
        withObjectBallAt({ shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: '0.05' }),
      ),
      { keyword: 'oneOf', instancePath: AT_PATH },
    );
  });

  it('rejects a circle whose center is not a point', () => {
    expectErrorMatching(
      expectInvalid(withObjectBallAt({ shape: 'circle', center: { x: 0.5 }, radius: 0.05 })),
      { keyword: 'required', missingProperty: 'y' },
    );
    expectErrorMatching(
      expectInvalid(withObjectBallAt({ shape: 'circle', center: [0.5, 0.25], radius: 0.05 })),
      { keyword: 'oneOf', instancePath: AT_PATH },
    );
  });
});

describe('placement — rect region', () => {
  it('accepts a rect region', () => {
    expectValid(
      withObjectBallAt({
        shape: 'rect',
        min: { x: 0.1, y: 0.1 },
        max: { x: 0.4, y: 0.4 },
      }),
    );
  });

  it('rejects a rect missing min', () => {
    const errors = expectInvalid(withObjectBallAt({ shape: 'rect', max: { x: 0.4, y: 0.4 } }));
    expectErrorMatching(errors, { keyword: 'required', missingProperty: 'min' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('rejects a rect missing max', () => {
    const errors = expectInvalid(withObjectBallAt({ shape: 'rect', min: { x: 0.1, y: 0.1 } }));
    expectErrorMatching(errors, { keyword: 'required', missingProperty: 'max' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('rejects the origin-plus-size rectangle form — 0.1 uses min/max corners', () => {
    const errors = expectInvalid(
      withObjectBallAt({ shape: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.3 }),
    );
    expectErrorMatching(errors, { keyword: 'required', missingProperty: 'min' });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('rejects a rect corner that is not a point', () => {
    expectErrorMatching(
      expectInvalid(
        withObjectBallAt({ shape: 'rect', min: { x: 0.1 }, max: { x: 0.4, y: 0.4 } }),
      ),
      { keyword: 'required', missingProperty: 'y' },
    );
    expectErrorMatching(
      expectInvalid(
        withObjectBallAt({ shape: 'rect', min: { x: 0.1, y: 0.1 }, max: [0.4, 0.4] }),
      ),
      { keyword: 'oneOf', instancePath: AT_PATH },
    );
  });
});

describe('placement — the `shape` discriminator', () => {
  it.each(['blob', 'polygon', 'point', 'Circle', 'rectangle', ''])(
    'rejects the unknown region shape %o',
    (shape) => {
      expectErrorMatching(
        expectInvalid(withObjectBallAt({ shape, center: { x: 0.5, y: 0.25 }, radius: 0.05 })),
        { keyword: 'oneOf', instancePath: AT_PATH },
      );
    },
  );

  it('rejects a non-string shape', () => {
    expectErrorMatching(
      expectInvalid(withObjectBallAt({ shape: 1, center: { x: 0.5, y: 0.25 }, radius: 0.05 })),
      { keyword: 'oneOf', instancePath: AT_PATH },
    );
  });

  // The guard added in M1.3: without it, an ill-formed region — `shape`
  // present but the region's own fields missing and replaced by x/y — would
  // quietly validate as a point, silently relocating the ball. ADR-0006
  // leniency covers *unknown* properties, not the format's own
  // discriminator.
  it('does not let a malformed circle fall through to the point branch', () => {
    const errors = expectInvalid(withObjectBallAt({ shape: 'circle', x: 0.5, y: 0.25 }));
    expectErrorMatching(errors, { keyword: 'not', instancePath: AT_PATH });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('does not let a malformed rect fall through to the point branch', () => {
    const errors = expectInvalid(withObjectBallAt({ shape: 'rect', x: 0.5, y: 0.25 }));
    expectErrorMatching(errors, { keyword: 'not', instancePath: AT_PATH });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });

  it('does not let an unknown shape fall through to the point branch', () => {
    const errors = expectInvalid(withObjectBallAt({ shape: 'blob', x: 0.5, y: 0.25 }));
    expectErrorMatching(errors, { keyword: 'not', instancePath: AT_PATH });
    expectErrorMatching(errors, { keyword: 'oneOf', instancePath: AT_PATH });
  });
});
