// The normative coordinate mathematics of docs/coordinates.md §§3–7, as
// plain functions (M1.7, issue #8).
//
// This module is arithmetic and nothing else. It answers "what is the
// normalized radius of this ball on this table", "how far apart are these
// two points", "where is diamond (4,2)" — and never "is this drill
// valid". Geometry *validation* (POINT_OUT_OF_BOUNDS, BALL_OVERLAP,
// region checks) is M1.8 / issue #9 and builds on these; nothing here
// returns an issue, reads a whole drill, or knows what a rule is.
//
// The project's geometry/physics boundary (docs/coordinates.md §9) holds
// here too: distances, bounds arithmetic, and coordinate conversion yes;
// velocity, spin, friction, restitution, and collision response no.
//
// Every function is pure, total over shape-valid input, and holds no
// state. Inputs are the drill's own sub-objects, typed from the generated
// schema types so there is no parallel hand-maintained geometry model.
import type { AuthoredFor, Point } from '@pool-drill-gen/schema';

/**
 * The authoritative playing-surface geometry, cushion nose to cushion
 * nose (docs/coordinates.md §1).
 *
 * Aliased from the generated schema type rather than restated, so the
 * helpers below cannot drift from the document they read. `lengthIn` is
 * `L` and `widthIn` is `W` throughout this file.
 */
export type PlayingSurface = AuthoredFor['playingSurface'];

/** The ball set a drill was authored with (ADR-0005). Aliased, not restated. */
export type BallSet = AuthoredFor['ballSet'];

/**
 * A position in diamond coordinates (docs/coordinates.md §7).
 *
 * Deliberately not `{ x, y }`: diamonds and canonical coordinates are
 * different scales on the same axes, and a type that cannot be confused
 * with `Point` is the cheapest possible defence against mixing them.
 * Diamonds are an input and display convenience only — they are never
 * stored, and nothing in the schema accepts them (ADR-0004).
 */
export interface DiamondPoint {
  /** Along the length, head → foot. `[0, 8]`. */
  dx: number;
  /** Across the width, left → right. `[0, 4]`. */
  dy: number;
}

/** Diamonds along the long rail (docs/coordinates.md §7). */
const DIAMONDS_ALONG_LENGTH = 8;

/** Diamonds along the short rail (docs/coordinates.md §7). */
const DIAMONDS_ACROSS_WIDTH = 4;

/**
 * The surface's aspect ratio, `W / L` — which is exactly the upper bound
 * of `y` (docs/coordinates.md §3.1, ADR-0004).
 *
 * ```
 * surfaceRatio = widthIn / lengthIn
 * ```
 *
 * Every table this project currently targets is 2:1, so this returns
 * `0.5` for all of them. That is an arithmetic result, never an
 * assumption: `0.5` appears nowhere in this file, and a non-2:1 surface
 * is a data question rather than a format change.
 *
 * The nominal `tableSize` label is not consulted and must not be — the
 * inch measurements are authoritative (ADR-0005).
 *
 * Callers pass a shape-valid surface; the schema requires both dimensions
 * to be numbers greater than zero, so there is no division guard here and
 * no validation of any kind.
 */
export function surfaceRatio(surface: PlayingSurface): number {
  return surface.widthIn / surface.lengthIn;
}

/**
 * A ball's radius in normalized units (docs/coordinates.md §4).
 *
 * ```
 * ballRadius = (ballDiameterIn / 2) / lengthIn
 * ```
 *
 * The ball does not scale with the table, so `r` grows as the table
 * shrinks: a 2¼″ ball is `0.011250` of a 9-footer and `0.014423` of a
 * 7-footer. This is the single most important consequence of normalizing,
 * and the reason `playingSurface` and `ballSet` are required fields
 * rather than nice-to-haves (ADR-0005, docs/coordinates.md §§8.2–8.3).
 *
 * Only `lengthIn` is read — both axes are divided by `L` (ADR-0004) — but
 * the whole surface is taken rather than a bare number, because two loose
 * numbers are two chances to pass `W` where `L` belongs.
 *
 * The result is not rounded. Rounding to 4 decimal places is a
 * serialization rule for coordinates a writer emits
 * (docs/coordinates.md §3.2); intermediate arithmetic keeps full
 * precision.
 */
export function ballRadius(surface: PlayingSurface, ballSet: BallSet): number {
  return ballSet.ballDiameterIn / 2 / surface.lengthIn;
}

/**
 * Euclidean distance between two points, in normalized units.
 *
 * ```
 * distance = sqrt((b.x - a.x)² + (b.y - a.y)²)
 * ```
 *
 * One expression, because there is one scale: both axes are divided by
 * the table length, so this distance is proportional to the real one and
 * every angle is preserved (ADR-0004). Multiplying the result by
 * `lengthIn` gives inches.
 *
 * Arithmetic only. Whether two balls are too close to coexist is
 * `BALL_OVERLAP`, a rule in M1.8 — this function has no opinion about
 * ball size and returns the same number for points that could never both
 * hold a ball.
 *
 * `Math.hypot` rather than a hand-rolled `sqrt` of squares: same value,
 * without squaring intermediates that could overflow or lose precision.
 */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Converts diamond coordinates to canonical normalized coordinates
 * (docs/coordinates.md §7.1).
 *
 * ```
 * x = dx / 8
 * y = dy × (W / L) / 4
 * ```
 *
 * The `y` conversion goes through the surface ratio, which is why the
 * surface is a parameter. On a 2:1 table it happens to reduce to
 * `dy / 8`, and one diamond is `0.125` on both axes — but that
 * simplification is only valid when `W / L` is `0.5`, so it is not the
 * implementation. Diamond spacing across the width depends on the aspect
 * ratio; that dependence is precisely why diamonds are not the canonical
 * unit (ADR-0004).
 *
 * Diamonds are input and display only. The returned point is what gets
 * stored.
 */
export function fromDiamonds(diamonds: DiamondPoint, surface: PlayingSurface): Point {
  return {
    x: diamonds.dx / DIAMONDS_ALONG_LENGTH,
    y: (diamonds.dy * surfaceRatio(surface)) / DIAMONDS_ACROSS_WIDTH,
  };
}

/**
 * Converts canonical normalized coordinates to diamond coordinates —
 * the exact inverse of {@link fromDiamonds} (docs/coordinates.md §7.1).
 *
 * ```
 * dx = x × 8
 * dy = y × 4 × (L / W)
 * ```
 *
 * Written as `y × 4 / (W / L)`, which is the same expression: the surface
 * ratio is defined in exactly one place, so the two directions cannot
 * disagree about what `W / L` means.
 *
 * For display and CLI echo. Nothing serializes the result.
 */
export function toDiamonds(point: Point, surface: PlayingSurface): DiamondPoint {
  return {
    dx: point.x * DIAMONDS_ALONG_LENGTH,
    dy: (point.y * DIAMONDS_ACROSS_WIDTH) / surfaceRatio(surface),
  };
}
