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
  // Resolution is by id against the first ball declaring it. When ids are
  // unique — the only case the format actually permits — "first" is
  // simply "the" ball; when they are not, the duplicate is already
  // reported above and resolving deterministically avoids inventing a
  // second, derived complaint about the same mistake.
  const firstBallIndexById = new Map<string, number>();
  drill.balls.forEach((ball, index) => {
    if (!firstBallIndexById.has(ball.id)) firstBallIndexById.set(ball.id, index);
  });

  drill.shots.forEach((shot, shotIndex) => {
    const ballIndex = firstBallIndexById.get(shot.ballId);

    if (ballIndex === undefined) {
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

    // Obstacles exist to block or constrain and are never shot at
    // (ADR-0003). Both halves of the relationship are named, because
    // either end could be the typo: the shot may mean a different ball,
    // or the ball may have the wrong role.
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
 * - `strict`: `shots[].n` is binding. It must be contiguous from 1 in the
 *   authored array order, so `shots[i].n === i + 1`.
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
    // The array is the authored sequence and is never sorted first:
    // sorting would accept [3, 1, 2] as "the numbers 1..3", which is
    // exactly the reordering this rule exists to catch. Comparing each
    // position against its expected number catches a start above 1, a
    // gap, a repeat, and a reorder with no separate check for any of
    // them, and reports one issue per offending shot rather than one
    // verdict on the whole sequence.
    drill.shots.forEach((shot, index) => {
      const expected = index + 1;
      if (shot.n !== expected) {
        issues.push({
          code: 'SHOT_NUMBERING_INVALID',
          paths: [`shots[${index}].n`],
          message: `Strict sequencing expected shot number ${expected}; found ${shot.n}.`,
        });
      }
    });
  }

  // "any_order" falls through with nothing to say. That is the rule, not
  // an omission: n labels the shots in a diagram and does not constrain
  // the order they are attempted in (ADR-0009), so core must not
  // reinterpret it as sequencing.

  return issues;
}
