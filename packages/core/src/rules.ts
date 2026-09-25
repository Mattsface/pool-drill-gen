// The semantic rules format 0.1 implements (M1.6, issue #7).
//
// Everything here is a plain function over an already-shape-validated
// document that returns issues; nothing throws, nothing mutates the
// drill, and nothing holds state between calls. validateDrill() is the
// only caller, and it simply concatenates what these return — there is no
// registry, no plugin surface, and no ordering logic anywhere but here.
//
// Issue order is part of the contract: a caller printing issues, and a
// test asserting on them, both need the same answer every run. Each
// function below walks the document in array order and never iterates a
// plain object or a Set where insertion order would not be the document's
// order.
//
// Identity and sequencing rules (M1.6) read no table dimensions. The
// geometry rules (M1.8) read them only through the TableGeometry they are
// handed, never from the drill directly, so the same rules can later be
// run against a table other than the authoring one.
import type { CircleRegion, Drill, Point, RectRegion, Region } from '@pool-drill-gen/schema';
import { ballRadius, distance, surfaceRatio, type TableGeometry } from './geometry.js';
import type { ValidationIssue } from './validation.js';

/**
 * Ball identity and the shot→ball references that depend on it.
 *
 * Identity is the opaque `id` and nothing else: no rule here reads
 * `number` or `label`, and no relationship is keyed by either (ADR-0003).
 *
 * Issues come back in document order — the cue-ball count first, then
 * duplicate ids by the position of each id's first occurrence, then one
 * issue per offending shot in `shots` order.
 */
export function validateIdentityAndReferences(drill: Drill): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // --- Exactly one cue ball -------------------------------------------
  //
  // One issue describes the count, however wrong it is: "found 3" is the
  // problem, and three separate issues would say the same thing three
  // times. With no cue ball there is no offending ball to point at, so
  // the issue carries no path rather than an invented one.
  const cueBallIndices: number[] = [];
  drill.balls.forEach((ball, index) => {
    if (ball.role === 'cue') cueBallIndices.push(index);
  });

  if (cueBallIndices.length !== 1) {
    issues.push({
      code: 'CUE_BALL_COUNT_INVALID',
      paths: cueBallIndices.map((index) => `balls[${index}]`),
      message: `Drill must contain exactly one cue ball; found ${cueBallIndices.length}.`,
    });
  }

  // --- Unique ball ids -------------------------------------------------
  //
  // One issue per duplicated id value, carrying every position that id
  // appears at. Grouping this way keeps unrelated collisions apart: a
  // drill that repeats both "b1" and "b2" has two independent problems,
  // and a single issue naming four paths would not say which is which.
  //
  // A Map, not a plain object: insertion order is the balls array's
  // order, and no id — "constructor", "__proto__" — can collide with
  // anything on a prototype.
  const ballIndicesById = new Map<string, number[]>();
  drill.balls.forEach((ball, index) => {
    const seen = ballIndicesById.get(ball.id);
    if (seen) seen.push(index);
    else ballIndicesById.set(ball.id, [index]);
  });

  for (const [id, indices] of ballIndicesById) {
    if (indices.length > 1) {
      issues.push({
        code: 'DUPLICATE_BALL_ID',
        paths: indices.map((index) => `balls[${index}].id`),
        message: `Ball id ${JSON.stringify(id)} is used more than once.`,
      });
    }
  }

  // --- Shot references -------------------------------------------------
  //
  // A reference resolves against how many balls declare the id, not
  // against whichever one happens to come first. Three cases, and the
  // middle one is the only place a role is read:
  //
  //   0 matches  → UNKNOWN_BALL_REFERENCE. The id names nothing.
  //   1 match    → resolvable. Its role decides whether the reference is
  //                legal.
  //   2+ matches → nothing here. The id exists, so it is not unknown;
  //                which ball it means is undecidable, so no role can be
  //                inspected without picking one arbitrarily. The
  //                DUPLICATE_BALL_ID issue above is the authoritative
  //                report, and it already names every position.
  //
  // Picking the first match would make the output depend on the order two
  // duplicate balls happen to be stored in: the same two balls, swapped,
  // would produce an OBSTACLE_BALL_REFERENCED issue in one document and
  // not in the other, for the same single underlying mistake. Deriving a
  // second complaint from an identity that is already reported broken is
  // exactly the cascade this module avoids elsewhere.
  drill.shots.forEach((shot, shotIndex) => {
    const ballIndices = ballIndicesById.get(shot.ballId);

    if (ballIndices === undefined) {
      issues.push({
        code: 'UNKNOWN_BALL_REFERENCE',
        paths: [`shots[${shotIndex}].ballId`],
        message: `Shot references unknown ball id ${JSON.stringify(shot.ballId)}.`,
      });
      // An unresolved reference has no role to judge, so the obstacle
      // check below is not merely skipped for tidiness — there is
      // nothing it could look at. One mistake, one issue.
      return;
    }

    if (ballIndices.length > 1) return;

    // Exactly one ball declares the id, so the reference is unambiguous.
    // Obstacles exist to block or constrain and are never shot at
    // (ADR-0003). Both halves of the relationship are named, because
    // either end could be the typo: the shot may mean a different ball,
    // or the ball may have the wrong role.
    const ballIndex = ballIndices[0];
    if (drill.balls[ballIndex].role === 'obstacle') {
      issues.push({
        code: 'OBSTACLE_BALL_REFERENCED',
        paths: [`shots[${shotIndex}].ballId`, `balls[${ballIndex}].role`],
        message: 'Shots may not reference obstacle balls.',
      });
    }
  });

  // A shot referencing the *cue* ball is deliberately not a rule here.
  // The schema package's boundary tests describe it as core's to reject,
  // but issue #7 forbids only obstacle references, ADR-0003 states the
  // obstacle rule and no equivalent for the cue ball, and the M1.5 code
  // vocabulary has no code for it. Inventing one — or borrowing an
  // unrelated code — would settle by accident a question no accepted
  // decision has answered. It needs an ADR, not a commit.

  return issues;
}

/**
 * Shot numbering and shot count, per sequencing mode (ADR-0009).
 *
 * - `strict`: `shots[].n` is binding and must be contiguous from 1. For N
 *   shots the authored numbers must collectively be exactly 1..N, each
 *   once. Storage order is not itself the sequence — `n` is — so a
 *   complete set in a different array order is valid.
 * - `single_shot`: exactly one shot. The schema's `minItems: 1` makes the
 *   real failure "more than one", but the check is written as a
 *   cardinality check, not as an upper bound.
 * - `any_order`: `n` is display numbering only and constrains nothing.
 *   Repeats, gaps, and descending numbers are all legal.
 */
export function validateSequencing(drill: Drill): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (drill.sequencing === 'single_shot') {
    if (drill.shots.length !== 1) {
      issues.push({
        code: 'SHOT_COUNT_INVALID',
        paths: ['shots'],
        message: `single_shot sequencing requires exactly one shot; found ${drill.shots.length}.`,
      });
    }
    return issues;
  }

  if (drill.sequencing === 'strict') {
    issues.push(...validateStrictNumbering(drill.shots));
  }

  // "any_order" falls through with nothing to say. That is the rule, not
  // an omission: n labels the shots in a diagram and does not constrain
  // the order they are attempted in (ADR-0009), so core must not
  // reinterpret it as sequencing.

  return issues;
}

/**
 * The strict-numbering rule, on its own so `validateSequencing` stays a
 * dispatch over the three modes.
 *
 * Issue #7 and ADR-0009 both say the same thing: under `strict`, shot
 * numbering "is contiguous starting at 1". Neither makes the *array* the
 * sequence. The format already carries an explicit sequence number, so
 * the rule is about the numbers themselves — for N shots, the authored
 * `n` values must collectively be exactly 1..N, each used once.
 *
 * Reading array position as a second, implicit sequence would reject
 * `[3, 1, 2]`, a drill whose numbers say plainly and completely what
 * order the shots are attempted in. Storage order is storage order:
 * nothing here sorts, and nothing here is written back.
 *
 * Two things can go wrong with a multiset, and each gets an issue:
 *
 *   - a number outside 1..N, reported per shot;
 *   - a number used more than once, reported once per repeated value and
 *     carrying every position that uses it — the same grouping the
 *     duplicate-id rule uses, so two unrelated repeats stay two issues.
 *
 * A *missing* number needs no third case and no new code. N slots hold N
 * numbers, so a gap can only exist alongside an out-of-range value or a
 * repeat: every invalid multiset trips at least one of the two above.
 * The missing numbers are named in the message so the gap is diagnosable
 * without a path that could not exist anyway.
 *
 * Issues come back in `shots` order, a repeat reported at the position it
 * first appears, so output is deterministic and reads top to bottom.
 */
function validateStrictNumbering(shots: Drill['shots']): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const count = shots.length;

  // Positions using each authored number, in shots order.
  const indicesByNumber = new Map<number, number[]>();
  shots.forEach((shot, index) => {
    const seen = indicesByNumber.get(shot.n);
    if (seen) seen.push(index);
    else indicesByNumber.set(shot.n, [index]);
  });

  const missing: number[] = [];
  for (let n = 1; n <= count; n += 1) {
    if (!indicesByNumber.has(n)) missing.push(n);
  }
  // Only ever appended to a message that is already being reported, so
  // this is never the sole description of a failure.
  const missingNote = missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '';

  shots.forEach((shot, index) => {
    if (shot.n < 1 || shot.n > count) {
      issues.push({
        code: 'SHOT_NUMBERING_INVALID',
        paths: [`shots[${index}].n`],
        message:
          `Strict sequencing numbers ${count} shot${count === 1 ? '' : 's'} ` +
          `1 through ${count}; found ${shot.n}.${missingNote}`,
      });
      return;
    }

    // In range, so report it only as a repeat, and only at the position
    // it first appears — otherwise one repeated number would produce an
    // issue per copy, all saying the same thing.
    const indices = indicesByNumber.get(shot.n) ?? [];
    if (indices.length > 1 && indices[0] === index) {
      issues.push({
        code: 'SHOT_NUMBERING_INVALID',
        paths: indices.map((at) => `shots[${at}].n`),
        message:
          `Strict sequencing uses each of 1 through ${count} exactly once; ` +
          `shot number ${shot.n} is used ${indices.length} times.${missingNote}`,
      });
    }
  });

  return issues;
}

/**
 * Floating-point slack for the overlap comparison only, in normalized
 * units.
 *
 * This is numerical hygiene, not a format tolerance. Two balls authored
 * exactly one diameter apart on a 9-foot table — centres at 0.5 and
 * 0.5225 — compute a separation of 0.022499999999999964, not 0.0225,
 * because neither decimal has an exact binary representation. The spec
 * says equality means frozen together (docs/coordinates.md §4.2), so that
 * arithmetic noise alone must not produce BALL_OVERLAP.
 *
 * It applies to one comparison: a computed separation against a computed
 * minimum separation. 1e-12 covers IEEE-754 rounding in that arithmetic
 * with a wide margin (the noise above is about 4e-17) and is 1e-10 in on
 * a 9-foot table, so it cannot excuse any real overlap. It is never
 * applied to bounds: §4.1 is compared exactly, and keeping authored
 * values legal is the serializer's job (§3.2).
 */
const SEPARATION_NOISE = 1e-12;

/**
 * Where a ball centre may legally be: the playing surface inset by one
 * ball radius on every side (docs/coordinates.md §4.1). Inclusive at both
 * ends — a centre exactly at `x = r` is frozen on the head cushion, which
 * is legal.
 */
interface LegalArea {
  /** Ball radius, normalized. */
  r: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function legalAreaFor(geometry: TableGeometry): LegalArea {
  const r = ballRadius(geometry.playingSurface, geometry.ballSet);
  // W / L from the surface, never a literal (ADR-0004).
  const yMax = surfaceRatio(geometry.playingSurface);
  return { r, minX: r, maxX: 1 - r, minY: r, maxY: yMax - r };
}

function pointInArea(point: Point, area: LegalArea): boolean {
  return (
    point.x >= area.minX &&
    point.x <= area.maxX &&
    point.y >= area.minY &&
    point.y <= area.maxY
  );
}

/** The one point-versus-region discriminator: a placement without `shape` is a point (ADR-0008). */
function isRegion(placement: Point | Region): placement is Region {
  return 'shape' in placement;
}

/** A number for a message: enough digits to see a radius-sized difference, no float noise. */
function show(value: number): string {
  return String(Number(value.toFixed(6)));
}

function describeArea(area: LegalArea): string {
  return (
    `x in [${show(area.minX)}, ${show(area.maxX)}], ` +
    `y in [${show(area.minY)}, ${show(area.maxY)}]`
  );
}

/**
 * Placement bounds, region well-formedness, and fixed-ball overlap, all
 * against the given table geometry (ADR-0005, ADR-0008,
 * docs/coordinates.md §4).
 *
 * `validateDrill()` passes the drill's own `authoredFor` geometry unless
 * the caller supplies another; this function never reads `authoredFor`
 * itself, and never reads the nominal `tableSize` label at all.
 *
 * Three rules, in this order:
 *
 * 1. Every `balls[].at` — then every `shots[].cueBallTarget` — must be
 *    legal. A point must lie in the legal area (`POINT_OUT_OF_BOUNDS`). A
 *    region must first be well-formed (`REGION_GEOMETRY_INVALID`) and
 *    then lie entirely inside the legal area (`REGION_OUT_OF_BOUNDS`).
 * 2. A region that is not well-formed is not also checked for bounds.
 *    A circle with a negative radius, or a rectangle whose corners are
 *    swapped, has no extent to compare — and repairing it (taking
 *    `|radius|`, swapping `min` and `max`) to produce a second issue
 *    would guess at what the author meant. One mistake, one issue.
 * 3. Every pair of *fixed-point* balls must be at least one diameter
 *    apart (`BALL_OVERLAP`). A ball placed by region takes no part: whether
 *    a legal position exists inside a region given the other balls is a
 *    documented 0.1 gap (ADR-0008), not something approximated here.
 *
 * Issues come back balls first in array order, then shots in array
 * order, then overlaps ordered by the first ball of each pair and then
 * the second.
 */
export function validateGeometry(drill: Drill, geometry: TableGeometry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const area = legalAreaFor(geometry);

  // --- Placements -----------------------------------------------------
  drill.balls.forEach((ball, index) => {
    const path = `balls[${index}].at`;
    const subject = `Ball ${JSON.stringify(ball.id)}`;
    if (isRegion(ball.at)) {
      issues.push(...validateRegion(ball.at, path, `${subject} placement region`, area));
    } else if (!pointInArea(ball.at, area)) {
      issues.push({
        code: 'POINT_OUT_OF_BOUNDS',
        paths: [path],
        message:
          `${subject} is centred at (${show(ball.at.x)}, ${show(ball.at.y)}), outside the ` +
          `legal area ${describeArea(area)} — the playing surface inset by one ball radius.`,
      });
    }
  });

  // --- Position goals -------------------------------------------------
  //
  // A cue-ball target is the same Region primitive as a placement region
  // and describes where the cue ball's centre should finish, so ADR-0008's
  // region validation applies to it unchanged.
  drill.shots.forEach((shot, index) => {
    if (shot.cueBallTarget === undefined) return;
    issues.push(
      ...validateRegion(
        shot.cueBallTarget,
        `shots[${index}].cueBallTarget`,
        `Shot ${index + 1} cue-ball target`,
        area,
      ),
    );
  });

  // --- Fixed-ball overlap ---------------------------------------------
  //
  // One issue per overlapping pair, naming both balls: three balls stacked
  // on one spot are three pairwise problems, and each can be fixed
  // independently. Balls outside the legal area still take part — being
  // out of bounds and overlapping another ball are separate facts.
  const fixed: { index: number; id: string; at: Point }[] = [];
  drill.balls.forEach((ball, index) => {
    if (!isRegion(ball.at)) fixed.push({ index, id: ball.id, at: ball.at });
  });

  const minimumSeparation = 2 * area.r;
  for (let i = 0; i < fixed.length; i += 1) {
    for (let j = i + 1; j < fixed.length; j += 1) {
      const a = fixed[i];
      const b = fixed[j];
      const separation = distance(a.at, b.at);
      if (separation < minimumSeparation - SEPARATION_NOISE) {
        issues.push({
          code: 'BALL_OVERLAP',
          paths: [`balls[${a.index}]`, `balls[${b.index}]`],
          message:
            `Balls ${JSON.stringify(a.id)} and ${JSON.stringify(b.id)} overlap at their ` +
            `authored positions: centres are ${show(separation)} apart, and at least ` +
            `${show(minimumSeparation)} (one ball diameter) is required.`,
        });
      }
    }
  }

  return issues;
}

/**
 * One region's well-formedness and bounds. Bounds are checked only when
 * the region is well-formed — see rule 2 on {@link validateGeometry}.
 */
function validateRegion(
  region: Region,
  path: string,
  subject: string,
  area: LegalArea,
): ValidationIssue[] {
  return region.shape === 'circle'
    ? validateCircle(region, path, subject, area)
    : validateRect(region, path, subject, area);
}

function validateCircle(
  circle: CircleRegion,
  path: string,
  subject: string,
  area: LegalArea,
): ValidationIssue[] {
  if (!(circle.radius > 0)) {
    return [
      {
        code: 'REGION_GEOMETRY_INVALID',
        paths: [`${path}.radius`],
        message: `${subject} is a circle with radius ${show(circle.radius)}; the radius must be greater than zero.`,
      },
    ];
  }

  // The circle is the set of places the ball centre may go, so its whole
  // extent — not just its centre — must fit the legal area. For a circle
  // that is exactly its axis-aligned bounding box.
  const { center, radius } = circle;
  const inBounds =
    pointInArea({ x: center.x - radius, y: center.y - radius }, area) &&
    pointInArea({ x: center.x + radius, y: center.y + radius }, area);

  if (inBounds) return [];
  return [
    {
      code: 'REGION_OUT_OF_BOUNDS',
      paths: [path],
      message:
        `${subject} (centre (${show(center.x)}, ${show(center.y)}), radius ${show(radius)}) ` +
        `extends outside the legal area ${describeArea(area)} — the playing surface inset by one ball radius.`,
    },
  ];
}

function validateRect(
  rect: RectRegion,
  path: string,
  subject: string,
  area: LegalArea,
): ValidationIssue[] {
  // Strictly less on both axes (ADR-0008). A zero-width rectangle is
  // rejected, and swapped corners are reported, never swapped back.
  const issues: ValidationIssue[] = [];
  for (const axis of ['x', 'y'] as const) {
    if (!(rect.min[axis] < rect.max[axis])) {
      issues.push({
        code: 'REGION_GEOMETRY_INVALID',
        paths: [`${path}.min.${axis}`, `${path}.max.${axis}`],
        message:
          `${subject} is a rectangle whose min.${axis} (${show(rect.min[axis])}) is not ` +
          `less than its max.${axis} (${show(rect.max[axis])}).`,
      });
    }
  }
  if (issues.length > 0) return issues;

  // A well-formed rectangle is inside the legal area exactly when both of
  // its corners are.
  if (pointInArea(rect.min, area) && pointInArea(rect.max, area)) return [];
  return [
    {
      code: 'REGION_OUT_OF_BOUNDS',
      paths: [path],
      message:
        `${subject} (min (${show(rect.min.x)}, ${show(rect.min.y)}), ` +
        `max (${show(rect.max.x)}, ${show(rect.max.y)})) extends outside the legal area ` +
        `${describeArea(area)} — the playing surface inset by one ball radius.`,
    },
  ];
}
