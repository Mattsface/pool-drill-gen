// M1.8 (issue #9): geometry validation — placement bounds, region
// well-formedness, and fixed-ball overlap.
//
// Every document here is schema-valid; what makes it wrong is where the
// balls are on *this* table. Expected numbers are derived from
// docs/coordinates.md (§4 radius and bounds, §8 worked examples) rather
// than from the implementation, and the legal area is always computed
// from the drill's own inch dimensions — no test assumes W / L = 0.5.
import { describe, expect, it } from 'vitest';
import type { AuthoredFor, Ball, Drill, Placement, Region } from '@pool-drill-gen/schema';
import { validateDrill, type ValidationCode, type ValidationIssue } from '../src/index.js';

const NINE_FOOT: AuthoredFor = {
  tableSize: '9ft',
  playingSurface: { lengthIn: 100, widthIn: 50 },
  ballSet: { ballDiameterIn: 2.25 },
};

/** Normalized radius and legal area for an authoredFor, from coordinates.md §4.1. */
function legal(authoredFor: AuthoredFor) {
  const { lengthIn, widthIn } = authoredFor.playingSurface;
  const r = authoredFor.ballSet.ballDiameterIn / 2 / lengthIn;
  const ratio = widthIn / lengthIn;
  return { r, minX: r, maxX: 1 - r, minY: r, maxY: ratio - r };
}

/**
 * A valid single-shot drill on the given table: the cue ball at the head
 * spot, the object ball at the foot spot, and any extra balls appended.
 * The cue ball's placement can be replaced to test it on its own.
 */
function drillWith(
  options: { authoredFor?: AuthoredFor; cueAt?: Placement; extra?: Ball[] } = {},
): Drill {
  return {
    format: 'pool-drill',
    formatVersion: '0.1',
    id: 'm1-8-test-drill',
    title: 'Geometry validation test drill',
    authoredFor: options.authoredFor ?? NINE_FOOT,
    balls: [
      { id: 'cue', role: 'cue', at: options.cueAt ?? { x: 0.25, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.75, y: 0.25 } },
      ...(options.extra ?? []),
    ],
    sequencing: 'single_shot',
    shots: [{ n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right' }],
    success: { mode: 'run_all' },
    provenance: { createdAt: '2026-08-28T14:00:00Z' },
  };
}

/** A drill whose balls are exactly the given list; shot references b1. */
function drillWithBalls(balls: [Ball, ...Ball[]], authoredFor: AuthoredFor = NINE_FOOT): Drill {
  return { ...drillWith({ authoredFor }), balls };
}

function issues(drill: Drill): ValidationIssue[] {
  return validateDrill(drill).issues;
}

function codes(drill: Drill): ValidationCode[] {
  return issues(drill).map((issue) => issue.code);
}

describe('fixed-point bounds', () => {
  const area = legal(NINE_FOOT);

  it('accepts a point in the interior', () => {
    expect(validateDrill(drillWith())).toEqual({ valid: true, issues: [] });
  });

  it('accepts a centre exactly on every radius-inset boundary', () => {
    // A ball frozen on a cushion sits exactly one radius from it (§4.1).
    const corners = [
      { x: area.minX, y: area.minY },
      { x: area.minX, y: area.maxY },
      { x: area.maxX, y: area.minY },
      { x: area.maxX, y: area.maxY },
    ];
    for (const cueAt of corners) {
      expect(issues(drillWith({ cueAt })), JSON.stringify(cueAt)).toEqual([]);
    }
  });

  it('accepts the §8.2 frozen-on-the-foot-cushion coordinates as written', () => {
    // 9 ft: r = 0.01125, so x = 1 - r = 0.98875.
    expect(issues(drillWith({ cueAt: { x: 0.98875, y: 0.25 } }))).toEqual([]);
  });

  it.each([
    ['head cushion', { x: area.minX - 0.0001, y: 0.25 }],
    ['foot cushion', { x: area.maxX + 0.0001, y: 0.25 }],
    ['left rail', { x: 0.25, y: area.minY - 0.0001 }],
    ['right rail', { x: 0.25, y: area.maxY + 0.0001 }],
  ])('rejects a centre too close to the %s', (_, cueAt) => {
    expect(issues(drillWith({ cueAt }))).toEqual([
      { code: 'POINT_OUT_OF_BOUNDS', paths: ['balls[0].at'], message: expect.any(String) },
    ]);
  });

  it('rejects x = 0 and y = 0 rather than reading them as "against the rail"', () => {
    expect(codes(drillWith({ cueAt: { x: 0, y: 0.25 } }))).toEqual(['POINT_OUT_OF_BOUNDS']);
    expect(codes(drillWith({ cueAt: { x: 0.25, y: 0 } }))).toEqual(['POINT_OUT_OF_BOUNDS']);
  });

  it('reports every out-of-bounds ball, in balls order', () => {
    const drill = drillWith({
      cueAt: { x: 0, y: 0.25 },
      extra: [{ id: 'b2', role: 'object', at: { x: 0.5, y: 0.6 } }],
    });
    expect(issues(drill).map((issue) => issue.paths)).toEqual([['balls[0].at'], ['balls[2].at']]);
  });

  it('computes the y bound from W / L on a wider-than-2:1 surface', () => {
    // 100 × 60: y_max = 0.6, so y = 0.55 is legal here and would not be
    // under a hardcoded 0.5.
    const wide: AuthoredFor = { ...NINE_FOOT, playingSurface: { lengthIn: 100, widthIn: 60 } };
    expect(issues(drillWith({ authoredFor: wide, cueAt: { x: 0.25, y: 0.55 } }))).toEqual([]);
    expect(codes(drillWith({ cueAt: { x: 0.25, y: 0.55 } }))).toEqual(['POINT_OUT_OF_BOUNDS']);
  });

  it('computes the y bound from W / L on a narrower-than-2:1 surface', () => {
    // 100 × 40: y_max = 0.4, so y = 0.45 is out even though it is inside
    // 0.5 - r.
    const narrow: AuthoredFor = { ...NINE_FOOT, playingSurface: { lengthIn: 100, widthIn: 40 } };
    const { maxY } = legal(narrow);
    expect(codes(drillWith({ authoredFor: narrow, cueAt: { x: 0.25, y: 0.45 } }))).toEqual([
      'POINT_OUT_OF_BOUNDS',
    ]);
    expect(issues(drillWith({ authoredFor: narrow, cueAt: { x: 0.25, y: maxY } }))).toEqual([]);
  });

  it('insets by the radius of the drill’s own ball set and table length', () => {
    // 7 ft (78 in): r = 0.014423. x = 0.0130 clears a 9-footer's inset
    // (0.01125) but not a 7-footer's.
    const sevenFoot: AuthoredFor = {
      tableSize: '7ft',
      playingSurface: { lengthIn: 78, widthIn: 39 },
      ballSet: { ballDiameterIn: 2.25 },
    };
    expect(issues(drillWith({ cueAt: { x: 0.013, y: 0.25 } }))).toEqual([]);
    expect(codes(drillWith({ authoredFor: sevenFoot, cueAt: { x: 0.013, y: 0.25 } }))).toEqual([
      'POINT_OUT_OF_BOUNDS',
    ]);
  });
});

describe('circle regions', () => {
  const area = legal(NINE_FOOT);
  const circle = (x: number, y: number, radius: number): Region => ({
    shape: 'circle',
    center: { x, y },
    radius,
  });

  it('accepts a circle inside the legal area', () => {
    expect(issues(drillWith({ cueAt: circle(0.2, 0.25, 0.05) }))).toEqual([]);
  });

  it.each([0, -0.05])('rejects radius %s as invalid geometry, without a bounds issue', (radius) => {
    expect(issues(drillWith({ cueAt: circle(0.2, 0.25, radius) }))).toEqual([
      {
        code: 'REGION_GEOMETRY_INVALID',
        paths: ['balls[0].at.radius'],
        message: expect.any(String),
      },
    ]);
  });

  it.each([
    ['head cushion', circle(0.05, 0.25, 0.04)],
    ['foot cushion', circle(0.95, 0.25, 0.04)],
    ['left rail', circle(0.5, 0.05, 0.04)],
    ['right rail', circle(0.5, 0.45, 0.04)],
  ])('rejects a circle crossing the %s inset', (_, cueAt) => {
    // Each centre is itself legal; only the circle's extent crosses.
    expect(issues(drillWith({ cueAt }))).toEqual([
      { code: 'REGION_OUT_OF_BOUNDS', paths: ['balls[0].at'], message: expect.any(String) },
    ]);
  });

  it('accepts a circle whose extent exactly touches the legal boundary', () => {
    // Centred across the width with radius (W/L)/2 - r: spans exactly
    // [r, W/L - r] in y.
    const radius = (area.maxY - area.minY) / 2;
    const centreY = (area.minY + area.maxY) / 2;
    expect(issues(drillWith({ cueAt: circle(0.5, centreY, radius) }))).toEqual([]);
    // And touching the head inset.
    expect(issues(drillWith({ cueAt: circle(area.minX + 0.05, 0.25, 0.05) }))).toEqual([]);
  });
});

describe('rectangle regions', () => {
  const area = legal(NINE_FOOT);
  const rect = (minX: number, minY: number, maxX: number, maxY: number): Region => ({
    shape: 'rect',
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
  });

  it('accepts a rectangle inside the legal area', () => {
    expect(issues(drillWith({ cueAt: rect(0.1, 0.1, 0.2, 0.4) }))).toEqual([]);
  });

  it('accepts the §8.4 ball-in-hand kitchen region with every corner rounded inward', () => {
    expect(issues(drillWith({ cueAt: rect(0.0113, 0.0113, 0.25, 0.4887) }))).toEqual([]);
  });

  it('rejects §8.4 as printed, whose max.y rounds outward past W/L - r', () => {
    // §8.4 prints max.y = 0.4888 for 0.5 - 0.01125 = 0.48875: rounded
    // half-up, i.e. outward, while its min corner (0.0113 for 0.01125) is
    // rounded inward. §4.1 is the rule and has no rounding allowance, so
    // the printed example is 0.00005 out of bounds. Recorded here rather
    // than hidden by a tolerance; see the M1.8 report.
    expect(codes(drillWith({ cueAt: rect(0.0113, 0.0113, 0.25, 0.4888) }))).toEqual([
      'REGION_OUT_OF_BOUNDS',
    ]);
  });

  it('accepts a rectangle exactly covering the legal area', () => {
    const cueAt = rect(area.minX, area.minY, area.maxX, area.maxY);
    // The object ball is fixed, and inside; the region does not overlap-check.
    expect(issues(drillWith({ cueAt }))).toEqual([]);
  });

  it.each([
    ['min.x equal to max.x', rect(0.2, 0.1, 0.2, 0.4)],
    ['min.x greater than max.x', rect(0.3, 0.1, 0.2, 0.4)],
  ])('rejects %s', (_, cueAt) => {
    expect(issues(drillWith({ cueAt }))).toEqual([
      {
        code: 'REGION_GEOMETRY_INVALID',
        paths: ['balls[0].at.min.x', 'balls[0].at.max.x'],
        message: expect.any(String),
      },
    ]);
  });

  it.each([
    ['min.y equal to max.y', rect(0.1, 0.3, 0.2, 0.3)],
    ['min.y greater than max.y', rect(0.1, 0.4, 0.2, 0.1)],
  ])('rejects %s', (_, cueAt) => {
    expect(issues(drillWith({ cueAt }))).toEqual([
      {
        code: 'REGION_GEOMETRY_INVALID',
        paths: ['balls[0].at.min.y', 'balls[0].at.max.y'],
        message: expect.any(String),
      },
    ]);
  });

  it('reports both axes of a fully swapped rectangle, and never repairs it', () => {
    // Swapped back, this rectangle would also be out of bounds (min.y =
    // 0.005). It is reported as malformed only: no guessing at intent.
    const drill = drillWith({ cueAt: rect(0.9, 0.4, 0.1, 0.005) });
    const before = JSON.stringify(drill);
    expect(codes(drill)).toEqual(['REGION_GEOMETRY_INVALID', 'REGION_GEOMETRY_INVALID']);
    expect(JSON.stringify(drill)).toBe(before);
  });

  it.each([
    ['head cushion', rect(0.005, 0.1, 0.2, 0.4)],
    ['foot cushion', rect(0.8, 0.1, 0.995, 0.4)],
    ['left rail', rect(0.1, 0.005, 0.2, 0.4)],
    ['right rail', rect(0.1, 0.1, 0.2, 0.495)],
  ])('rejects a rectangle crossing the %s inset', (_, cueAt) => {
    expect(issues(drillWith({ cueAt }))).toEqual([
      { code: 'REGION_OUT_OF_BOUNDS', paths: ['balls[0].at'], message: expect.any(String) },
    ]);
  });

  it('rejects the §8.4 kitchen corner when rounded outward instead of inward', () => {
    // 0.0112 < r = 0.01125.
    expect(codes(drillWith({ cueAt: rect(0.0112, 0.0113, 0.25, 0.4888) }))).toEqual([
      'REGION_OUT_OF_BOUNDS',
    ]);
  });
});

describe('cue-ball target regions', () => {
  function withTarget(cueBallTarget: Region): Drill {
    return {
      ...drillWith(),
      shots: [{ n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right', cueBallTarget }],
    };
  }

  it('accepts a target inside the legal area', () => {
    expect(issues(withTarget({ shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: 0.1 }))).toEqual(
      [],
    );
  });

  it('validates a target like any other region', () => {
    expect(
      issues(withTarget({ shape: 'rect', min: { x: 0.5, y: 0.0 }, max: { x: 0.6, y: 0.2 } })),
    ).toEqual([
      {
        code: 'REGION_OUT_OF_BOUNDS',
        paths: ['shots[0].cueBallTarget'],
        message: expect.any(String),
      },
    ]);
    expect(
      issues(withTarget({ shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: -1 })),
    ).toEqual([
      {
        code: 'REGION_GEOMETRY_INVALID',
        paths: ['shots[0].cueBallTarget.radius'],
        message: expect.any(String),
      },
    ]);
  });
});

describe('fixed-ball overlap', () => {
  it('accepts separated balls', () => {
    const drill = drillWith({ extra: [{ id: 'b2', role: 'object', at: { x: 0.8, y: 0.25 } }] });
    expect(issues(drill)).toEqual([]);
  });

  it('accepts balls frozen together, exactly one diameter apart', () => {
    // 9 ft: 2r = 0.0225. 0.5225 - 0.5 is 0.022499999999999964 in binary
    // floating point; frozen must still read as frozen, not overlapping.
    const drill = drillWith({
      cueAt: { x: 0.5, y: 0.25 },
      extra: [{ id: 'b2', role: 'object', at: { x: 0.5225, y: 0.25 } }],
    });
    expect(issues(drill)).toEqual([]);
  });

  it('accepts balls frozen together along a diagonal', () => {
    // 3-4-5: offsets 0.0135 and 0.018 give a separation of exactly 0.0225.
    const drill = drillWith({
      cueAt: { x: 0.5, y: 0.25 },
      extra: [{ id: 'b2', role: 'object', at: { x: 0.5135, y: 0.268 } }],
    });
    expect(issues(drill)).toEqual([]);
  });

  it('rejects overlapping balls, naming both', () => {
    const drill = drillWith({
      cueAt: { x: 0.5, y: 0.25 },
      extra: [{ id: 'b2', role: 'object', at: { x: 0.51, y: 0.25 } }],
    });
    expect(issues(drill)).toEqual([
      { code: 'BALL_OVERLAP', paths: ['balls[0]', 'balls[2]'], message: expect.any(String) },
    ]);
    expect(issues(drill)[0].message).toContain('"cue"');
    expect(issues(drill)[0].message).toContain('"b2"');
  });

  it('reports each overlapping pair separately, in pair order', () => {
    // Three balls on one spot are three pairwise overlaps; b3/b4 are an
    // unrelated fourth.
    const drill = drillWithBalls([
      { id: 'cue', role: 'cue', at: { x: 0.25, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.25, y: 0.25 } },
      { id: 'b2', role: 'object', at: { x: 0.25, y: 0.26 } },
      { id: 'b3', role: 'object', at: { x: 0.7, y: 0.1 } },
      { id: 'b4', role: 'obstacle', at: { x: 0.71, y: 0.1 } },
    ]);
    expect(issues(drill).map(({ code, paths }) => ({ code, paths }))).toEqual([
      { code: 'BALL_OVERLAP', paths: ['balls[0]', 'balls[1]'] },
      { code: 'BALL_OVERLAP', paths: ['balls[0]', 'balls[2]'] },
      { code: 'BALL_OVERLAP', paths: ['balls[1]', 'balls[2]'] },
      { code: 'BALL_OVERLAP', paths: ['balls[3]', 'balls[4]'] },
    ]);
  });

  it('ignores region placements', () => {
    // The cue region is centred on the object ball; region-versus-ball
    // feasibility is a documented 0.1 gap (ADR-0008), not an overlap.
    const drill = drillWith({
      cueAt: { shape: 'circle', center: { x: 0.75, y: 0.25 }, radius: 0.05 },
    });
    expect(issues(drill)).toEqual([]);

    const rectOverBall = drillWith({
      cueAt: { shape: 'rect', min: { x: 0.7, y: 0.2 }, max: { x: 0.8, y: 0.3 } },
    });
    expect(issues(rectOverBall)).toEqual([]);
  });

  it('still reports an overlap when one ball is also out of bounds', () => {
    const drill = drillWithBalls([
      { id: 'cue', role: 'cue', at: { x: 0.005, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.01, y: 0.25 } },
    ]);
    expect(codes(drill)).toEqual(['POINT_OUT_OF_BOUNDS', 'POINT_OUT_OF_BOUNDS', 'BALL_OVERLAP']);
  });

  describe('§8.3: centres 0.0250 apart on four tables', () => {
    const surface = (lengthIn: number): AuthoredFor => ({
      tableSize: 'nominal',
      playingSurface: { lengthIn, widthIn: lengthIn / 2 },
      ballSet: { ballDiameterIn: 2.25 },
    });
    const pair = (authoredFor: AuthoredFor) =>
      drillWithBalls(
        [
          { id: 'cue', role: 'cue', at: { x: 0.25, y: 0.25 } },
          { id: 'b1', role: 'object', at: { x: 0.5, y: 0.25 } },
          { id: 'b2', role: 'object', at: { x: 0.525, y: 0.25 } },
        ],
        authoredFor,
      );

    it.each([
      [100, []],
      [92, []],
      [88, ['BALL_OVERLAP']],
      [78, ['BALL_OVERLAP']],
    ])('L = %s in', (lengthIn, expected) => {
      expect(codes(pair(surface(lengthIn)))).toEqual(expected);
    });
  });
});

describe('validateDrill geometry API', () => {
  it('uses the authored geometry when `against` is omitted', () => {
    const drill = drillWith({
      cueAt: { x: 0.005, y: 0.25 },
      extra: [{ id: 'b2', role: 'object', at: { x: 0.76, y: 0.25 } }],
    });
    const authored = {
      playingSurface: drill.authoredFor.playingSurface,
      ballSet: drill.authoredFor.ballSet,
    };
    expect(validateDrill(drill)).toEqual(validateDrill(drill, { against: authored }));
    expect(validateDrill(drill, {})).toEqual(validateDrill(drill));
  });

  it('derives geometry from inch dimensions, never from the tableSize label', () => {
    // Labelled 7 ft, measured 100 × 50: the inches are authoritative
    // (ADR-0005), so the 9-foot inset applies.
    const mislabelled: AuthoredFor = { ...NINE_FOOT, tableSize: '7ft' };
    expect(issues(drillWith({ authoredFor: mislabelled, cueAt: { x: 0.013, y: 0.25 } }))).toEqual(
      [],
    );
  });

  it('derives the radius from the ball set', () => {
    // A 3-inch ball on a 100-inch table: r = 0.015.
    const bigBalls: AuthoredFor = { ...NINE_FOOT, ballSet: { ballDiameterIn: 3 } };
    expect(codes(drillWith({ authoredFor: bigBalls, cueAt: { x: 0.013, y: 0.25 } }))).toEqual([
      'POINT_OUT_OF_BOUNDS',
    ]);
    expect(issues(drillWith({ authoredFor: bigBalls, cueAt: { x: 0.015, y: 0.25 } }))).toEqual([]);
  });

  it('appends geometry issues after identity and sequencing issues', () => {
    const drill: Drill = {
      ...drillWithBalls([
        { id: 'b1', role: 'object', at: { x: 0.5, y: 0.25 } },
        { id: 'b2', role: 'object', at: { x: 0.5, y: 0.25 } },
      ]),
      shots: [
        { n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right' },
        { n: 2, type: 'pot', ballId: 'b2', pocket: 'foot_left' },
      ],
    };
    expect(codes(drill)).toEqual(['CUE_BALL_COUNT_INVALID', 'SHOT_COUNT_INVALID', 'BALL_OVERLAP']);
  });

  it('does not mutate the drill or the geometry it is handed', () => {
    const drill = drillWith({
      cueAt: { shape: 'rect', min: { x: 0.3, y: 0.1 }, max: { x: 0.2, y: 0.4 } },
    });
    const against = {
      playingSurface: drill.authoredFor.playingSurface,
      ballSet: drill.authoredFor.ballSet,
    };
    const before = JSON.stringify([drill, against]);
    validateDrill(drill);
    validateDrill(drill, { against });
    expect(JSON.stringify([drill, against])).toBe(before);
  });
});
