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
// Geometry rules (M1.8, issue #9) are deliberately absent: no bounds, no
// overlap, no region checks, and no table dimensions are read here.
import type { Drill } from '@pool-drill-gen/schema';
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
