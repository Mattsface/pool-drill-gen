// M1.7 (issue #8): geometry primitives and diamond helpers.
//
// docs/coordinates.md is normative, and §§8.1–8.5 exist so that an
// implementation can be checked against known arithmetic rather than
// trusted by inspection. This file is that check: the worked examples are
// reproduced here as tests, with the generic unit tests around them
// rather than instead of them.
//
// Two things these tests exist to make impossible:
//
//   1. A hidden `0.5`. Every table this project currently targets is 2:1,
//      so an implementation that hardcodes the width ratio passes every
//      realistic example. A non-2:1 surface (100 × 40) is therefore
//      exercised alongside the real profiles throughout, and its expected
//      values differ from the 2:1 ones wherever the ratio is involved.
//   2. Independently normalized axes. Both axes are divided by the table
//      length L (ADR-0004), so a ball's radius and a diamond's width
//      spacing both move with L. The §8.2 and §8.3 examples fail loudly
//      if either axis is scaled by W instead.
//
// §8.5 (canonical render mapping) is deliberately absent. It specifies
// `svgX = x * scale`, `svgY = y * scale` with no axis flip — a renderer
// concern with no geometry primitive behind it, and packages/svg is M2.
// Reviewed, and no helper was manufactured to have something to assert.
//
// Nothing here validates anything. Bounds, overlap, and region checks are
// M1.8 / issue #9 and are tested in geometry-validation.test.ts; the last
// describe block pins the helpers to arithmetic.
import { describe, expect, it } from 'vitest';
import type { Drill, Point } from '@pool-drill-gen/schema';
import {
  ballRadius,
  distance,
  fromDiamonds,
  surfaceRatio,
  toDiamonds,
  validateDrill,
  VALIDATION_CODES,
  type BallSet,
  type DiamondPoint,
  type PlayingSurface,
} from '../src/index.js';

// --- Table profiles ---------------------------------------------------
//
// The four real profiles from docs/coordinates.md §1, plus one that does
// not exist. Inch measurements are authoritative; no nominal label is
// recorded here, because no helper may derive geometry from one
// (ADR-0005).

const NINE_FT: PlayingSurface = { lengthIn: 100, widthIn: 50 };
const EIGHT_FT_OVERSIZE: PlayingSurface = { lengthIn: 92, widthIn: 46 };
const EIGHT_FT: PlayingSurface = { lengthIn: 88, widthIn: 44 };
const SEVEN_FT: PlayingSurface = { lengthIn: 78, widthIn: 39 };

/**
 * A surface no manufacturer makes: W / L = 0.4, not 0.5.
 *
 * Its whole job is to fail any implementation that assumes 2:1. Every
 * expectation computed against it differs from the 2:1 answer.
 */
const NARROW: PlayingSurface = { lengthIn: 100, widthIn: 40 };

/** A standard 2¼″ set — the diameter every worked example uses. */
const STANDARD_BALLS: BallSet = { ballDiameterIn: 2.25 };

/**
 * Comparison precision for values that are exact in decimal but computed
 * in binary floating point. Tight enough that a wrong formula cannot slip
 * through: 1e-10 is seven orders of magnitude below the 4-decimal-place
 * serialization precision these coordinates are written at (§3.2).
 */
const PRECISE = 10;

function expectPoint(actual: Point, expected: { x: number; y: number }, digits = PRECISE): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

function expectDiamonds(actual: DiamondPoint, expected: DiamondPoint, digits = PRECISE): void {
  expect(actual.dx).toBeCloseTo(expected.dx, digits);
  expect(actual.dy).toBeCloseTo(expected.dy, digits);
}

// ======================================================================
// surfaceRatio()
// ======================================================================

describe('surfaceRatio', () => {
  it('is W / L', () => {
    expect(surfaceRatio({ lengthIn: 100, widthIn: 50 })).toBeCloseTo(0.5, PRECISE);
    expect(surfaceRatio({ lengthIn: 88, widthIn: 44 })).toBeCloseTo(0.5, PRECISE);
  });

  it('gives 0.5 for every real table profile, as a result and not an assumption', () => {
    for (const surface of [NINE_FT, EIGHT_FT_OVERSIZE, EIGHT_FT, SEVEN_FT]) {
      expect(surfaceRatio(surface)).toBeCloseTo(0.5, PRECISE);
    }
  });

  it('gives 0.4 for a non-2:1 surface', () => {
    // If this returns 0.5, the implementation contains a literal rather
    // than a division.
    expect(surfaceRatio(NARROW)).toBeCloseTo(0.4, PRECISE);
  });

  it('is the upper bound of y', () => {
    // docs/coordinates.md §3.1: y ∈ [0, W/L], and that bound is derived
    // from the drill's own playingSurface, never hardcoded.
    expect(surfaceRatio(NINE_FT)).toBeCloseTo(0.5, PRECISE);
    expect(surfaceRatio(NARROW)).toBeCloseTo(0.4, PRECISE);
    expect(surfaceRatio({ lengthIn: 100, widthIn: 100 })).toBeCloseTo(1, PRECISE);
    expect(surfaceRatio({ lengthIn: 120, widthIn: 30 })).toBeCloseTo(0.25, PRECISE);
  });

  it('reads the inch measurements and not a nominal label', () => {
    // The schema is lenient and a playingSurface may carry properties
    // core does not understand (ADR-0006). A label riding along — even a
    // wrong one — changes nothing: tableSize is not data (ADR-0005).
    const labelled: PlayingSurface = { lengthIn: 100, widthIn: 40, tableSize: '9ft' };
    expect(surfaceRatio(labelled)).toBeCloseTo(0.4, PRECISE);
  });

  it('does not mutate its input', () => {
    const surface: PlayingSurface = { lengthIn: 100, widthIn: 50 };
    const before = JSON.stringify(surface);
    surfaceRatio(surface);
    expect(JSON.stringify(surface)).toBe(before);
  });
});

// ======================================================================
// ballRadius()
// ======================================================================

describe('ballRadius', () => {
  it('is (ballDiameterIn / 2) / L — 0.01125 for a 2.25" ball on a 100" surface', () => {
    // The headline acceptance number from issue #8.
    expect(ballRadius(NINE_FT, STANDARD_BALLS)).toBeCloseTo(0.01125, PRECISE);
  });

  it('reproduces the documented profile table (§4)', () => {
    const expected: ReadonlyArray<[string, PlayingSurface, number]> = [
      ['7 ft', SEVEN_FT, 0.014423],
      ['8 ft', EIGHT_FT, 0.012784],
      ['8 ft oversize', EIGHT_FT_OVERSIZE, 0.012228],
      ['9 ft', NINE_FT, 0.01125],
    ];

    for (const [, surface, radius] of expected) {
      // 6 decimal places is the precision the document's table is
      // printed at; the helper itself is not rounded.
      expect(ballRadius(surface, STANDARD_BALLS)).toBeCloseTo(radius, 6);
    }
  });

  it('reproduces the documented minimum centre separation 2r (§4)', () => {
    expect(2 * ballRadius(SEVEN_FT, STANDARD_BALLS)).toBeCloseTo(0.028846, 6);
    expect(2 * ballRadius(EIGHT_FT, STANDARD_BALLS)).toBeCloseTo(0.025568, 6);
    expect(2 * ballRadius(EIGHT_FT_OVERSIZE, STANDARD_BALLS)).toBeCloseTo(0.024457, 6);
    expect(2 * ballRadius(NINE_FT, STANDARD_BALLS)).toBeCloseTo(0.0225, 6);
  });

  it('grows as the table shrinks, because the ball does not scale', () => {
    // ADR-0005's central point, stated as an ordering rather than as
    // four independent numbers.
    const radii = [NINE_FT, EIGHT_FT_OVERSIZE, EIGHT_FT, SEVEN_FT].map((surface) =>
      ballRadius(surface, STANDARD_BALLS),
    );
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    }
  });

  it('divides by the length, never by the width', () => {
    // Two surfaces of the same length and different widths must give the
    // same radius: both axes are divided by L (ADR-0004), so W is not in
    // this formula at all.
    expect(ballRadius(NARROW, STANDARD_BALLS)).toBeCloseTo(
      ballRadius(NINE_FT, STANDARD_BALLS),
      PRECISE,
    );
    expect(ballRadius(NARROW, STANDARD_BALLS)).toBeCloseTo(0.01125, PRECISE);
  });

  it('scales with ball diameter', () => {
    expect(ballRadius(NINE_FT, { ballDiameterIn: 2.0 })).toBeCloseTo(0.01, PRECISE);
    expect(ballRadius(NINE_FT, { ballDiameterIn: 4.5 })).toBeCloseTo(
      2 * ballRadius(NINE_FT, STANDARD_BALLS),
      PRECISE,
    );
  });

  it('is not rounded to serialization precision', () => {
    // Writers round coordinates to 4 dp (§3.2). Intermediate arithmetic
    // does not: r on a 7-footer is 0.0144230769…, and a helper that
    // returned 0.0144 would quietly corrupt every downstream bound.
    const radius = ballRadius(SEVEN_FT, STANDARD_BALLS);
    expect(radius).toBeCloseTo(0.014423076923076924, 15);
    expect(radius).not.toBe(0.0144);
  });

  it('does not mutate its inputs', () => {
    const surface: PlayingSurface = { lengthIn: 100, widthIn: 50 };
    const balls: BallSet = { ballDiameterIn: 2.25 };
    const before = JSON.stringify([surface, balls]);
    ballRadius(surface, balls);
    expect(JSON.stringify([surface, balls])).toBe(before);
  });
});

// ======================================================================
// distance()
// ======================================================================

describe('distance', () => {
  it('is zero for identical points', () => {
    expect(distance({ x: 0.5, y: 0.25 }, { x: 0.5, y: 0.25 })).toBe(0);
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
  });

  it('measures horizontal separation', () => {
    expect(distance({ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 })).toBeCloseTo(0.5, PRECISE);
  });

  it('measures vertical separation', () => {
    expect(distance({ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.4 })).toBeCloseTo(0.3, PRECISE);
  });

  it('is Pythagorean', () => {
    // A 3-4-5 triangle, scaled.
    expect(distance({ x: 0, y: 0 }, { x: 0.03, y: 0.04 })).toBeCloseTo(0.05, PRECISE);
    expect(distance({ x: 0.5, y: 0.2 }, { x: 0.56, y: 0.28 })).toBeCloseTo(0.1, PRECISE);
  });

  it('is symmetric', () => {
    const a = { x: 0.2, y: 0.05 };
    const b = { x: 0.9, y: 0.45 };
    expect(distance(a, b)).toBeCloseTo(distance(b, a), PRECISE);
  });

  it('is independent of the table, because both axes share one scale', () => {
    // No surface is a parameter, and that is the point: a distance in
    // normalized units means the same thing on every table. What differs
    // between tables is what that distance is worth in inches (§8.3) and
    // how big a ball is (§4) — not the distance itself.
    const a = { x: 0.4, y: 0.1 };
    const b = { x: 0.4 + 0.03, y: 0.1 + 0.04 };
    expect(distance(a, b)).toBeCloseTo(0.05, PRECISE);
  });

  it('preserves angles: a 45° separation is equal on both axes', () => {
    // Normalizing each axis independently would make this false, and the
    // distortion would be invisible in the data (ADR-0004).
    const along = distance({ x: 0.5, y: 0.25 }, { x: 0.6, y: 0.25 });
    const across = distance({ x: 0.5, y: 0.25 }, { x: 0.5, y: 0.35 });
    expect(along).toBeCloseTo(across, PRECISE);
    expect(distance({ x: 0.5, y: 0.25 }, { x: 0.6, y: 0.35 })).toBeCloseTo(
      Math.SQRT2 * along,
      PRECISE,
    );
  });

  it('converts to inches by multiplying by L', () => {
    const separation = distance({ x: 0.5, y: 0.25 }, { x: 0.75, y: 0.25 });
    expect(separation * NINE_FT.lengthIn).toBeCloseTo(25, PRECISE);
    expect(separation * SEVEN_FT.lengthIn).toBeCloseTo(19.5, PRECISE);
  });

  it('accepts points carrying unknown properties', () => {
    // Lenient format, lossless round-trips (ADR-0006): a point a writer
    // did not fully understand still has an x and a y.
    const a: Point = { x: 0, y: 0, note: 'carried through' };
    const b: Point = { x: 0.3, y: 0.4, note: 'carried through' };
    expect(distance(a, b)).toBeCloseTo(0.5, PRECISE);
  });

  it('does not mutate its inputs', () => {
    const a: Point = { x: 0.1, y: 0.2 };
    const b: Point = { x: 0.3, y: 0.4 };
    const before = JSON.stringify([a, b]);
    distance(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
  });
});

// ======================================================================
// fromDiamonds() / toDiamonds()
// ======================================================================

describe('fromDiamonds', () => {
  it('maps diamond (4,2) to the centre spot', () => {
    // The acceptance criterion from issue #8, and §6's centre spot.
    expectPoint(fromDiamonds({ dx: 4, dy: 2 }, NINE_FT), { x: 0.5, y: 0.25 });
  });

  it('maps diamond (6,2) to the foot spot', () => {
    expectPoint(fromDiamonds({ dx: 6, dy: 2 }, NINE_FT), { x: 0.75, y: 0.25 });
  });

  it('reproduces the §7.2 landmark table on a 2:1 surface', () => {
    const landmarks: ReadonlyArray<[string, DiamondPoint, { x: number; y: number }]> = [
      ['head_left', { dx: 0, dy: 0 }, { x: 0, y: 0 }],
      ['head_right', { dx: 0, dy: 4 }, { x: 0, y: 0.5 }],
      ['side_left', { dx: 4, dy: 0 }, { x: 0.5, y: 0 }],
      ['side_right', { dx: 4, dy: 4 }, { x: 0.5, y: 0.5 }],
      ['foot_left', { dx: 8, dy: 0 }, { x: 1, y: 0 }],
      ['foot_right', { dx: 8, dy: 4 }, { x: 1, y: 0.5 }],
      ['centre spot', { dx: 4, dy: 2 }, { x: 0.5, y: 0.25 }],
      ['foot spot', { dx: 6, dy: 2 }, { x: 0.75, y: 0.25 }],
    ];

    for (const [, diamonds, expected] of landmarks) {
      expectPoint(fromDiamonds(diamonds, NINE_FT), expected);
    }
  });

  it('puts the head string at dx = 2, x = 0.25', () => {
    expect(fromDiamonds({ dx: 2, dy: 0 }, NINE_FT).x).toBeCloseTo(0.25, PRECISE);
  });

  it('accepts fractional diamonds', () => {
    expectPoint(fromDiamonds({ dx: 3.5, dy: 2 }, NINE_FT), { x: 0.4375, y: 0.25 });
    expectPoint(fromDiamonds({ dx: 0.5, dy: 0.5 }, NINE_FT), { x: 0.0625, y: 0.0625 });
  });

  it('spaces one diamond at 0.125 on both axes only because the surface is 2:1', () => {
    // §7.1's "simplifies pleasantly" note, asserted as a consequence of
    // the ratio rather than as the rule.
    const oneAlong = fromDiamonds({ dx: 1, dy: 0 }, NINE_FT).x;
    const oneAcross = fromDiamonds({ dx: 0, dy: 1 }, NINE_FT).y;
    expect(oneAlong).toBeCloseTo(0.125, PRECISE);
    expect(oneAcross).toBeCloseTo(0.125, PRECISE);

    // And on a narrower surface they are not equal: diamonds are square
    // only at 2:1.
    expect(fromDiamonds({ dx: 1, dy: 0 }, NARROW).x).toBeCloseTo(0.125, PRECISE);
    expect(fromDiamonds({ dx: 0, dy: 1 }, NARROW).y).toBeCloseTo(0.1, PRECISE);
  });

  it('scales y by the surface ratio, not by a hardcoded 0.5', () => {
    // On 100 × 40 the centre of the table is y = 0.2, not 0.25. An
    // implementation using `dy / 8` passes every 2:1 example and fails
    // here.
    expectPoint(fromDiamonds({ dx: 4, dy: 2 }, NARROW), { x: 0.5, y: 0.2 });
    expect(fromDiamonds({ dx: 4, dy: 2 }, NARROW).y).not.toBeCloseTo(0.25, 4);
  });

  it('puts dy = 4 on the right rail for any surface ratio', () => {
    // y's upper bound is W/L (§3.1), and the fourth diamond is the rail.
    for (const surface of [NINE_FT, EIGHT_FT, SEVEN_FT, NARROW, { lengthIn: 120, widthIn: 30 }]) {
      expect(fromDiamonds({ dx: 0, dy: 4 }, surface).y).toBeCloseTo(surfaceRatio(surface), PRECISE);
    }
  });

  it('does not depend on the length for x', () => {
    // x = dx / 8 regardless of the table: the long axis is already
    // normalized to [0, 1].
    for (const surface of [NINE_FT, SEVEN_FT, NARROW]) {
      expect(fromDiamonds({ dx: 6, dy: 0 }, surface).x).toBeCloseTo(0.75, PRECISE);
    }
  });

  it('returns a fresh point and does not mutate its inputs', () => {
    const diamonds: DiamondPoint = { dx: 4, dy: 2 };
    const surface: PlayingSurface = { lengthIn: 100, widthIn: 50 };
    const before = JSON.stringify([diamonds, surface]);

    const first = fromDiamonds(diamonds, surface);
    const second = fromDiamonds(diamonds, surface);
    expect(first).not.toBe(second);
    expect(JSON.stringify([diamonds, surface])).toBe(before);
  });
});

describe('toDiamonds', () => {
  it('maps the centre spot back to diamond (4,2)', () => {
    expectDiamonds(toDiamonds({ x: 0.5, y: 0.25 }, NINE_FT), { dx: 4, dy: 2 });
  });

  it('maps the foot spot back to diamond (6,2)', () => {
    expectDiamonds(toDiamonds({ x: 0.75, y: 0.25 }, NINE_FT), { dx: 6, dy: 2 });
  });

  it('reproduces the §7.2 landmark table in reverse on a 2:1 surface', () => {
    const landmarks: ReadonlyArray<[Point, DiamondPoint]> = [
      [{ x: 0, y: 0 }, { dx: 0, dy: 0 }],
      [{ x: 0, y: 0.5 }, { dx: 0, dy: 4 }],
      [{ x: 0.5, y: 0 }, { dx: 4, dy: 0 }],
      [{ x: 0.5, y: 0.5 }, { dx: 4, dy: 4 }],
      [{ x: 1, y: 0 }, { dx: 8, dy: 0 }],
      [{ x: 1, y: 0.5 }, { dx: 8, dy: 4 }],
    ];

    for (const [point, diamonds] of landmarks) {
      expectDiamonds(toDiamonds(point, NINE_FT), diamonds);
    }
  });

  it('uses L / W across the width, not a hardcoded 8', () => {
    // On 100 × 40, y = 0.2 is the long string — diamond 2, not 1.6.
    expectDiamonds(toDiamonds({ x: 0.5, y: 0.2 }, NARROW), { dx: 4, dy: 2 });
    expect(toDiamonds({ x: 0.5, y: 0.2 }, NARROW).dy).not.toBeCloseTo(1.6, 4);
  });

  it('maps the right rail to dy = 4 for any surface ratio', () => {
    for (const surface of [NINE_FT, EIGHT_FT, SEVEN_FT, NARROW, { lengthIn: 120, widthIn: 30 }]) {
      expect(toDiamonds({ x: 0, y: surfaceRatio(surface) }, surface).dy).toBeCloseTo(4, PRECISE);
    }
  });

  it('accepts points carrying unknown properties', () => {
    const point: Point = { x: 0.75, y: 0.25, provenance: 'unknown to core' };
    expectDiamonds(toDiamonds(point, NINE_FT), { dx: 6, dy: 2 });
  });

  it('returns a fresh object and does not mutate its inputs', () => {
    const point: Point = { x: 0.5, y: 0.25 };
    const surface: PlayingSurface = { lengthIn: 100, widthIn: 50 };
    const before = JSON.stringify([point, surface]);

    const first = toDiamonds(point, surface);
    const second = toDiamonds(point, surface);
    expect(first).not.toBe(second);
    expect(JSON.stringify([point, surface])).toBe(before);
  });
});

describe('diamond round trips', () => {
  const representative: readonly DiamondPoint[] = [
    { dx: 0, dy: 0 },
    { dx: 8, dy: 4 },
    { dx: 4, dy: 2 },
    { dx: 6, dy: 2 },
    { dx: 2, dy: 2 },
    { dx: 3.5, dy: 2 },
    { dx: 0.5, dy: 3.25 },
    { dx: 7.125, dy: 0.75 },
  ];

  it('toDiamonds(fromDiamonds(d)) ≈ d on a 2:1 surface', () => {
    for (const diamonds of representative) {
      expectDiamonds(toDiamonds(fromDiamonds(diamonds, NINE_FT), NINE_FT), diamonds);
    }
  });

  it('toDiamonds(fromDiamonds(d)) ≈ d on a non-2:1 surface', () => {
    for (const diamonds of representative) {
      expectDiamonds(toDiamonds(fromDiamonds(diamonds, NARROW), NARROW), diamonds);
    }
  });

  it('round-trips on every real profile', () => {
    for (const surface of [NINE_FT, EIGHT_FT_OVERSIZE, EIGHT_FT, SEVEN_FT]) {
      for (const diamonds of representative) {
        expectDiamonds(toDiamonds(fromDiamonds(diamonds, surface), surface), diamonds);
      }
    }
  });

  it('fromDiamonds(toDiamonds(p)) ≈ p', () => {
    const points: readonly Point[] = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 1, y: 0.5 },
      { x: 0.4375, y: 0.0625 },
    ];

    for (const point of points) {
      expectPoint(fromDiamonds(toDiamonds(point, NINE_FT), NINE_FT), point);
    }
  });

  it('round-trips a point on a non-2:1 surface', () => {
    const point: Point = { x: 0.6, y: 0.12 };
    expectPoint(fromDiamonds(toDiamonds(point, NARROW), NARROW), point);
  });
});

// ======================================================================
// The normative verification corpus — docs/coordinates.md §8
// ======================================================================

describe('§8.1 — the foot spot on four tables', () => {
  /** The documented physical position of the foot spot, in inches. */
  const documented: ReadonlyArray<
    [string, PlayingSurface, { fromHead: number; fromFoot: number; fromLeft: number }]
  > = [
    ['9 ft', NINE_FT, { fromHead: 75, fromFoot: 25, fromLeft: 25 }],
    ['8 ft oversize', EIGHT_FT_OVERSIZE, { fromHead: 69, fromFoot: 23, fromLeft: 23 }],
    ['8 ft standard', EIGHT_FT, { fromHead: 66, fromFoot: 22, fromLeft: 22 }],
    ['7 ft', SEVEN_FT, { fromHead: 58.5, fromFoot: 19.5, fromLeft: 19.5 }],
  ];

  it('is (0.7500, 0.2500) on every 2:1 profile', () => {
    // The normalized form transfers exactly — that is the property the
    // whole coordinate model exists for.
    for (const [, surface] of documented) {
      expectPoint(fromDiamonds({ dx: 6, dy: 2 }, surface), { x: 0.75, y: 0.25 });
    }
  });

  it('is one quarter of the length from the foot cushion and centred across the width', () => {
    for (const [, surface] of documented) {
      const footSpot = fromDiamonds({ dx: 6, dy: 2 }, surface);
      expect(1 - footSpot.x).toBeCloseTo(0.25, PRECISE);
      expect(footSpot.y).toBeCloseTo(surfaceRatio(surface) / 2, PRECISE);
    }
  });

  it('reproduces the documented physical distances', () => {
    // Inches are normalized units × L. No helper for that: multiplying
    // by the length is clearer than wrapping it.
    for (const [, surface, inches] of documented) {
      const footSpot = fromDiamonds({ dx: 6, dy: 2 }, surface);
      const L = surface.lengthIn;

      expect(footSpot.x * L).toBeCloseTo(inches.fromHead, 6);
      expect((1 - footSpot.x) * L).toBeCloseTo(inches.fromFoot, 6);
      expect(footSpot.y * L).toBeCloseTo(inches.fromLeft, 6);
    }
  });

  it('measures the same physical distance from the left cushion as from the foot cushion', () => {
    // True because the surface is 2:1 and the spot is a quarter length
    // from the foot: 0.25 L across and 0.25 L along. It is arithmetic,
    // not a definition — on a narrower table it does not hold.
    const footSpot = fromDiamonds({ dx: 6, dy: 2 }, NARROW);
    expect(footSpot.y * NARROW.lengthIn).toBeCloseTo(20, PRECISE);
    expect((1 - footSpot.x) * NARROW.lengthIn).toBeCloseTo(25, PRECISE);
  });
});

describe('§8.2 — a ball frozen on the foot cushion, centred', () => {
  /** The documented profiles, with r and x = 1 - r as printed. */
  const documented: ReadonlyArray<[string, PlayingSurface, number, number]> = [
    ['9 ft', NINE_FT, 0.01125, 0.98875],
    ['8 ft oversize', EIGHT_FT_OVERSIZE, 0.012228, 0.98777],
    ['7 ft', SEVEN_FT, 0.014423, 0.98558],
  ];

  it('places the centre one radius from the cushion: x = 1 - r', () => {
    for (const [, surface, radius, frozenX] of documented) {
      const r = ballRadius(surface, STANDARD_BALLS);
      expect(r).toBeCloseTo(radius, 6);
      expect(1 - r).toBeCloseTo(frozenX, 5);
    }
  });

  it('gives a different normalized coordinate on every table', () => {
    // A frozen ball is not a portable coordinate. If these three were
    // equal, the radius would not be dividing by L.
    const frozen = documented.map(([, surface]) => 1 - ballRadius(surface, STANDARD_BALLS));
    expect(frozen[0]).not.toBeCloseTo(frozen[1], 4);
    expect(frozen[1]).not.toBeCloseTo(frozen[2], 4);
    expect(frozen[0]).not.toBeCloseTo(frozen[2], 4);
  });

  it('keeps the physical cushion clearance at 1.125 in on every table', () => {
    // The whole point of §8.2: the normalized coordinate moves precisely
    // so that the physical clearance does not.
    for (const [, surface] of documented) {
      const frozenX = 1 - ballRadius(surface, STANDARD_BALLS);
      expect((1 - frozenX) * surface.lengthIn).toBeCloseTo(1.125, 9);
    }

    // And on the profile the document's table omits, plus a non-2:1
    // surface, because the rule is arithmetic and not a lookup.
    for (const surface of [EIGHT_FT, NARROW]) {
      const frozenX = 1 - ballRadius(surface, STANDARD_BALLS);
      expect((1 - frozenX) * surface.lengthIn).toBeCloseTo(1.125, 9);
    }
  });

  it('freezes on the head cushion at x = r by the same arithmetic', () => {
    // §4.1: a centre at x = r is touching the head cushion. x = 0 is not
    // "against the rail", it is invalid — which M1.8 will say, not this.
    for (const [, surface] of documented) {
      const r = ballRadius(surface, STANDARD_BALLS);
      expect(r * surface.lengthIn).toBeCloseTo(1.125, 9);
    }
  });

  it('freezes on the right rail at y = (W/L) - r, using the surface ratio', () => {
    // The same inset across the width, where the bound is W/L and never
    // 0.5 (§4.1, §3.1).
    for (const surface of [NINE_FT, SEVEN_FT, NARROW]) {
      const r = ballRadius(surface, STANDARD_BALLS);
      const frozenY = surfaceRatio(surface) - r;
      expect((surfaceRatio(surface) - frozenY) * surface.lengthIn).toBeCloseTo(1.125, 9);
    }

    expect(surfaceRatio(NINE_FT) - ballRadius(NINE_FT, STANDARD_BALLS)).toBeCloseTo(0.48875, 9);
    expect(surfaceRatio(NARROW) - ballRadius(NARROW, STANDARD_BALLS)).toBeCloseTo(0.38875, 9);
  });
});

describe('§8.3 — a layout that does not transfer', () => {
  /** Two centres 0.0250 normalized units apart, along the long axis. */
  const a: Point = { x: 0.5, y: 0.25 };
  const b: Point = { x: 0.525, y: 0.25 };

  const documented: ReadonlyArray<[string, PlayingSurface, number, boolean]> = [
    ['9 ft', NINE_FT, 2.5, true],
    ['8 ft oversize', EIGHT_FT_OVERSIZE, 2.3, true],
    ['8 ft standard', EIGHT_FT, 2.2, false],
    ['7 ft', SEVEN_FT, 1.95, false],
  ];

  it('separates the centres by 0.0250 normalized units', () => {
    expect(distance(a, b)).toBeCloseTo(0.025, PRECISE);
  });

  it('reproduces the documented physical separations', () => {
    for (const [, surface, inches] of documented) {
      expect(distance(a, b) * surface.lengthIn).toBeCloseTo(inches, 9);
    }
  });

  it('is physically legal on the larger profiles and impossible on the smaller ones', () => {
    // Arithmetic, not a rule: this compares the physical separation to
    // the ball diameter and reports what the document reports. The
    // semantic verdict — BALL_OVERLAP — is M1.8 / issue #9, and nothing
    // here produces a validation issue.
    for (const [, surface, inches, legal] of documented) {
      const physical = distance(a, b) * surface.lengthIn;
      expect(physical >= STANDARD_BALLS.ballDiameterIn).toBe(legal);
      expect(physical).toBeCloseTo(inches, 9);
    }
  });

  it('gives the same answer compared against 2r in normalized units', () => {
    // distance × L ≥ diameter and distance ≥ 2r are the same inequality.
    // Both forms are stated because M1.8 will use the normalized one.
    for (const [, surface, , legal] of documented) {
      const separation = distance(a, b);
      expect(separation >= 2 * ballRadius(surface, STANDARD_BALLS)).toBe(legal);
    }
  });

  it('gives opposite answers for two tables both called "8 ft"', () => {
    // The result that matters: the nominal label cannot determine
    // physical feasibility, which is why playingSurface is authoritative
    // (ADR-0005).
    const oversize = distance(a, b) * EIGHT_FT_OVERSIZE.lengthIn;
    const standard = distance(a, b) * EIGHT_FT.lengthIn;

    expect(oversize).toBeGreaterThanOrEqual(STANDARD_BALLS.ballDiameterIn);
    expect(standard).toBeLessThan(STANDARD_BALLS.ballDiameterIn);
  });

  it('measures the same separation across the width as along the length', () => {
    // Both axes are divided by L, so 0.025 across is 0.025 along. An
    // implementation normalizing y independently would scale this by the
    // aspect ratio and give 1.25 in on a 9-footer.
    const across = distance({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.225 });
    expect(across * NINE_FT.lengthIn).toBeCloseTo(2.5, 9);
    expect(across).toBeCloseTo(distance(a, b), PRECISE);
  });
});

describe('§8.4 — ball in hand behind the head string, 9-foot table', () => {
  const r = ballRadius(NINE_FT, STANDARD_BALLS);

  /**
   * Decimal round-half-up to 4 places, for this file only.
   *
   * §3.2 makes 4-decimal rounding a *writer* concern, so no rounding
   * lives in the geometry helpers and none is added here — this exists
   * solely to show that the unrounded values below are the ones the
   * document's serialized example was quantized from. It is plain
   * nearest rounding; §3.2's boundary rule is asserted separately.
   *
   * It rounds the shortest decimal form of the value rather than the
   * binary double, which matters: the nearest double to `0.01125` sits
   * just below the decimal midpoint, so `(0.01125).toFixed(4)` is
   * `"0.0112"` while the document says `0.0113`. Whoever writes the
   * serializer needs to know that.
   */
  function round4dp(value: number): number {
    return Math.round(Number((value * 1e4).toPrecision(15))) / 1e4;
  }

  it('computes the region from r and the surface ratio', () => {
    expect(r).toBeCloseTo(0.01125, PRECISE);

    const min = { x: r, y: r };
    const max = { x: 0.25, y: surfaceRatio(NINE_FT) - r };

    expect(min.x).toBeCloseTo(0.01125, PRECISE);
    expect(min.y).toBeCloseTo(0.01125, PRECISE);
    // max.x is the head string at 0.25 exactly — the boundary is
    // inclusive, so it is not inset by a radius (§6, §8.4).
    expect(max.x).toBeCloseTo(0.25, PRECISE);
    expect(max.y).toBeCloseTo(0.48875, PRECISE);
  });

  it('quantizes to the documented serialized example at 4 decimal places (§3.2)', () => {
    const maxY = surfaceRatio(NINE_FT) - r;

    // min: nearest 4 dp stays inside the legal domain, so it is used.
    expect(round4dp(r)).toBe(0.0113);
    expect(0.0113).toBeGreaterThanOrEqual(r);
    expect(round4dp(0.25)).toBe(0.25);

    // max.y: nearest 4 dp (0.4888) would cross W/L - r, so
    // constraint-preserving serialization takes the nearest legal
    // 4-decimal value instead.
    expect(round4dp(maxY)).toBe(0.4888);
    expect(0.4888).toBeGreaterThan(maxY);
    expect(0.4887).toBeLessThanOrEqual(maxY);
  });

  it('insets by a radius from three cushions and by nothing from the head string', () => {
    // The physical reading of the same numbers: 1.125 in off the head,
    // left, and right cushions.
    const L = NINE_FT.lengthIn;
    expect(r * L).toBeCloseTo(1.125, 9);
    expect((surfaceRatio(NINE_FT) - (surfaceRatio(NINE_FT) - r)) * L).toBeCloseTo(1.125, 9);
    expect(0.25 * L).toBeCloseTo(25, PRECISE);
  });

  it('derives the same region on a non-2:1 surface without a hardcoded 0.5', () => {
    // The kitchen is x ∈ [0, 0.25] on any table (§6) — that bound is on
    // the length-normalized axis. The width inset is not: max.y follows
    // the surface ratio.
    const narrowR = ballRadius(NARROW, STANDARD_BALLS);
    expect(narrowR).toBeCloseTo(0.01125, PRECISE);
    expect(surfaceRatio(NARROW) - narrowR).toBeCloseTo(0.38875, PRECISE);
    expect(surfaceRatio(NARROW) - narrowR).not.toBeCloseTo(0.48875, 4);
  });

  it('places the region corners inside the surface bounds', () => {
    // Stated as arithmetic. REGION_OUT_OF_BOUNDS is M1.8's code, and
    // nothing here reports one.
    const min = { x: r, y: r };
    const max = { x: 0.25, y: surfaceRatio(NINE_FT) - r };

    expect(min.x).toBeGreaterThanOrEqual(r);
    expect(min.y).toBeGreaterThanOrEqual(r);
    expect(max.x).toBeLessThanOrEqual(1 - r);
    expect(max.y).toBeLessThanOrEqual(surfaceRatio(NINE_FT) - r);
    expect(min.x).toBeLessThan(max.x);
    expect(min.y).toBeLessThan(max.y);
  });
});

// ======================================================================
// No helper assumes a 2:1 surface
// ======================================================================

describe('no helper assumes W / L === 0.5', () => {
  /** Ratios from very wide to very narrow, none of them 0.5. */
  const ratios: ReadonlyArray<PlayingSurface> = [
    { lengthIn: 100, widthIn: 40 },
    { lengthIn: 100, widthIn: 60 },
    { lengthIn: 100, widthIn: 100 },
    { lengthIn: 120, widthIn: 30 },
    { lengthIn: 84, widthIn: 35 },
  ];

  it('computes surfaceRatio from the dimensions for every one', () => {
    for (const surface of ratios) {
      expect(surfaceRatio(surface)).toBeCloseTo(surface.widthIn / surface.lengthIn, PRECISE);
      expect(surfaceRatio(surface)).not.toBeCloseTo(0.5, 6);
    }
  });

  it('converts diamonds by the general formula for every one', () => {
    for (const surface of ratios) {
      const ratio = surface.widthIn / surface.lengthIn;

      for (const dy of [0, 1, 2, 3, 4, 2.5]) {
        const point = fromDiamonds({ dx: 4, dy }, surface);
        expect(point.x).toBeCloseTo(0.5, PRECISE);
        expect(point.y).toBeCloseTo((dy * ratio) / 4, PRECISE);

        const back = toDiamonds(point, surface);
        expect(back.dx).toBeCloseTo(4, PRECISE);
        expect(back.dy).toBeCloseTo(dy, PRECISE);
      }
    }
  });

  it('computes ballRadius from the length alone for every one', () => {
    for (const surface of ratios) {
      expect(ballRadius(surface, STANDARD_BALLS)).toBeCloseTo(1.125 / surface.lengthIn, PRECISE);
    }
  });

  it('keeps distance independent of the ratio', () => {
    // distance takes no surface at all, which is the strongest possible
    // statement that it cannot assume one.
    const a: Point = { x: 0.1, y: 0.05 };
    const b: Point = { x: 0.2, y: 0.15 };
    const expected = Math.sqrt(0.1 * 0.1 + 0.1 * 0.1);
    expect(distance(a, b)).toBeCloseTo(expected, PRECISE);
  });

  it('never returns 0.5 for a centre spot that is not at 0.5', () => {
    // The single most likely hardcoding, stated once more as a direct
    // assertion: on 100 × 40 the centre of the table is y = 0.2.
    expect(fromDiamonds({ dx: 4, dy: 2 }, NARROW).y).toBeCloseTo(0.2, PRECISE);
    expect(fromDiamonds({ dx: 0, dy: 4 }, NARROW).y).toBeCloseTo(0.4, PRECISE);
  });
});

// ======================================================================
// Scope: primitives only
// ======================================================================

describe('M1.7 scope', () => {
  /** A drill whose geometry is nonsense but whose identity is fine. */
  function geometricallyImpossibleDrill(): Drill {
    return {
      format: 'pool-drill',
      formatVersion: '0.1',
      id: 'm1-7-geometry-scope-drill',
      title: 'Geometry scope drill',
      authoredFor: {
        tableSize: '9ft',
        playingSurface: { lengthIn: 100, widthIn: 50 },
        ballSet: { ballDiameterIn: 2.25 },
      },
      balls: [
        // Two balls at the same point, and one centre off the surface
        // entirely. Both are physically impossible.
        { id: 'cue', role: 'cue', at: { x: 0.5, y: 0.25 } },
        { id: 'b1', role: 'object', at: { x: 0.5, y: 0.25 } },
        { id: 'b2', role: 'object', at: { x: 9, y: -4 } },
      ],
      sequencing: 'any_order',
      shots: [
        { n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right' },
        { n: 2, type: 'pot', ballId: 'b2', pocket: 'foot_left' },
      ],
      success: { mode: 'run_all' },
      provenance: { createdAt: '2026-08-28T14:00:00Z' },
    };
  }

  it('leaves geometry verdicts to the M1.8 rules, which use the reserved codes', () => {
    // M1.7 guarded that adding these helpers changed no verdict. M1.8
    // (issue #9) wired the rules in, and this drill now fails the way it
    // should — with the M1.5 codes, not new ones.
    for (const code of ['POINT_OUT_OF_BOUNDS', 'BALL_OVERLAP'] as const) {
      expect(VALIDATION_CODES).toContain(code);
    }
    const result = validateDrill(geometricallyImpossibleDrill());
    expect(result.issues.map(({ code, paths }) => ({ code, paths }))).toEqual([
      { code: 'POINT_OUT_OF_BOUNDS', paths: ['balls[2].at'] },
      { code: 'BALL_OVERLAP', paths: ['balls[0]', 'balls[1]'] },
    ]);
  });

  it('adds no code to the vocabulary', () => {
    expect(VALIDATION_CODES).toHaveLength(10);
  });

  it('exposes only arithmetic, with no rule-shaped return values', () => {
    // Every helper returns a number or a plain coordinate pair. None
    // returns an issue, a verdict, or a boolean judgement — deciding
    // whether geometry is legal is M1.8's job.
    expect(typeof surfaceRatio(NINE_FT)).toBe('number');
    expect(typeof ballRadius(NINE_FT, STANDARD_BALLS)).toBe('number');
    expect(typeof distance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe('number');
    expect(Object.keys(fromDiamonds({ dx: 4, dy: 2 }, NINE_FT)).sort()).toEqual(['x', 'y']);
    expect(Object.keys(toDiamonds({ x: 0.5, y: 0.25 }, NINE_FT)).sort()).toEqual(['dx', 'dy']);
  });

  it('holds no state between calls', () => {
    const first = fromDiamonds({ dx: 4, dy: 2 }, NINE_FT);
    first.x = 99;

    const second = fromDiamonds({ dx: 4, dy: 2 }, NINE_FT);
    expect(second.x).toBeCloseTo(0.5, PRECISE);
    expect(surfaceRatio(NARROW)).toBeCloseTo(0.4, PRECISE);
    expect(surfaceRatio(NINE_FT)).toBeCloseTo(0.5, PRECISE);
  });
});
