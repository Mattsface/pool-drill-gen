// Semantic validation for drill documents.
//
// Validation in this project is split in two (CLAUDE.md):
//
//   JSON Schema  → shape:   required fields, enums, primitive types,
//                           conditional requirements (pot needs a pocket,
//                           count needs attempts/target).
//   validateDrill() → meaning: rules that need the whole document in hand,
//                           or the drill's own table geometry, and that
//                           must report a machine-readable code.
//
// Callers are expected to have run the shape validator already —
// validateDrillSchema from @pool-drill-gen/schema. This module never
// re-checks shape, never parses JSON, and never touches a file: it is a
// pure function over an already-typed document, so it runs unchanged in
// the CLI, a browser, a Worker, and tests.
import type { Drill } from '@pool-drill-gen/schema';
import type { TableGeometry } from './geometry.js';
import { validateGeometry, validateIdentityAndReferences, validateSequencing } from './rules.js';

/**
 * The semantic failures format 0.1 can report.
 *
 * Codes are the stable, machine-readable part of an issue: a caller may
 * switch on a code, group by it, or translate it. Messages are for people
 * and may be reworded at any time.
 *
 * The vocabulary is deliberately small and failure-oriented — it names
 * what is wrong with the document, not which function noticed. Codes are
 * added when a rule needs one, never speculatively; M2+ concerns
 * (progression models, region-versus-ball feasibility, spin and speed)
 * have no codes here because they have no rules.
 *
 * The identity and sequencing codes are implemented in M1.6, the
 * geometry codes in M1.8.
 */
export const VALIDATION_CODES = [
  // --- Ball identity and shot references (M1.6, issue #7) ---

  // A drill does not contain exactly one ball with role "cue" — either none, or
  // several. Paths list the offending balls, and are empty when there is none.
  'CUE_BALL_COUNT_INVALID',
  // Two or more balls share an `id`, which is unique within a drill (ADR-0003).
  'DUPLICATE_BALL_ID',
  // A `shots[].ballId` does not resolve to any declared ball.
  'UNKNOWN_BALL_REFERENCE',
  // A shot references a ball whose role is "obstacle"; obstacles are never shot at.
  'OBSTACLE_BALL_REFERENCED',

  // --- Sequencing (M1.6, issue #7) ---

  // Shot numbering is wrong for the sequencing mode: under "strict", `shots[].n`
  // must be contiguous from 1. Under "any_order" it is display numbering only and
  // constrains nothing (ADR-0009).
  'SHOT_NUMBERING_INVALID',
  // The number of shots is wrong for the sequencing mode: "single_shot" allows one.
  'SHOT_COUNT_INVALID',

  // --- Geometry (M1.8, issue #9) ---

  // A point places a ball centre outside the legal area — the playing surface inset
  // by one ball radius. Bounds come from the drill's own `playingSurface`, so the y
  // bound is W / L and never a hardcoded 0.5 (ADR-0004).
  'POINT_OUT_OF_BOUNDS',
  // A placement or cue-ball-target region falls outside that same legal area.
  'REGION_OUT_OF_BOUNDS',
  // A region is not a usable area in its own right: a circle with a non-positive
  // radius, or a rectangle whose `min` is not strictly less than its `max` on both
  // axes (ADR-0008). Whether a region is big enough to hold a ball given the other
  // balls is a documented 0.1 gap, not this code.
  'REGION_GEOMETRY_INVALID',
  // Two balls at authored fixed positions overlap: their centres are closer than
  // one ball diameter.
  'BALL_OVERLAP',
] as const;

/** A semantic failure code. Derived from VALIDATION_CODES so the two can never drift. */
export type ValidationCode = (typeof VALIDATION_CODES)[number];

/**
 * One semantic failure.
 *
 * Expected failures are data, not exceptions: an invalid drill is an
 * ordinary outcome, so nothing here is thrown and no message is ever the
 * only machine-readable part of a result.
 */
export interface ValidationIssue {
  /** What is wrong, as a stable identifier. */
  code: ValidationCode;
  /**
   * Where it is wrong: accessor paths into the document, such as
   * `balls[2]`, `shots[0].ballId`, or `balls[1].at.radius`.
   *
   * Property-accessor notation, not the JSON Pointer the shape validator
   * reports — a semantic issue routinely names several places at once
   * (both halves of an overlap, every duplicate id), and these paths are
   * read by people as often as by code. An issue may carry no path when
   * the failure is the absence of something, such as a drill with no cue
   * ball.
   */
  paths: string[];
  /** Human-readable explanation. Presentation only — never parse it. */
  message: string;
}

/**
 * The outcome of semantic validation.
 *
 * `valid` is exactly `issues.length === 0`. It is present because callers
 * read better for it, not as independent state: nothing may report
 * `valid: false` with no issues, or issues with `valid: true`.
 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** Options for {@link validateDrill}. */
export interface ValidateDrillOptions {
  /**
   * The table geometry to check bounds and overlap against. Defaults to
   * the drill's own `authoredFor.playingSurface` and
   * `authoredFor.ballSet`.
   *
   * Present so that checking a drill against a different table — a
   * layout authored on a 9-footer, practiced on a bar box (ADR-0005,
   * docs/coordinates.md §8.3) — needs no change to any call site. Format
   * 0.1 exercises only the default.
   */
  against?: TableGeometry;
}

/**
 * Validates a drill's *meaning*, assuming its shape has already been
 * validated against the JSON Schema.
 *
 * Every rule runs: validation reports everything wrong with a document,
 * not the first thing, because a caller fixing a drill wants the whole
 * list. Issues arrive grouped by rule — identity, sequencing, geometry —
 * and within each group in document order, so output is stable across
 * runs and diffable.
 */
export function validateDrill(drill: Drill, options: ValidateDrillOptions = {}): ValidationResult {
  const geometry: TableGeometry = options.against ?? {
    playingSurface: drill.authoredFor.playingSurface,
    ballSet: drill.authoredFor.ballSet,
  };

  const issues: ValidationIssue[] = [
    ...validateIdentityAndReferences(drill),
    ...validateSequencing(drill),
    ...validateGeometry(drill, geometry),
  ];

  return { valid: issues.length === 0, issues };
}
