# ADR-0008: Ball placement — points and regions

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

An early draft modelled `balls[].at` as an exact point, with a separate
`cueBallTarget` region for position goals. That splits one concept in two and
leaves a common case unrepresentable.

A large fraction of real drills do not fix the cue ball at a point:

- "ball in hand behind the head string"
- "cue ball anywhere on the head string"
- "place the cue ball anywhere in this area"

Position goals have the same shape from the other direction — landing "in this
area" is what position play means. Nobody lands the cue ball on a coordinate.

Two options existed: describe variable placement in prose in a `note` and let
the corpus force the issue later, or introduce the region primitive now. Prose
would have been a near-certain `0.x` break, since these drills appear
immediately.

## Decision

**A placement is either an exact point or a region. The same primitive is used
for ball positions and for cue-ball position goals.**

```
Placement := Point | Region

Point  := { "x": number, "y": number }

Region := { "shape": "circle", "center": Point, "radius": number }
        | { "shape": "rect",   "min": Point, "max": Point }
```

Discrimination is by the presence of `shape`. A placement without `shape` is a
point.

`balls[].at` accepts a Placement. `shots[].cueBallTarget` accepts a Region
(a position goal is never a single point).

### `shape`, not `type`

Regions use `shape`. `type` is already the shot discriminator, and one key
meaning different things at different nesting depths is a needless trap in a
format meant to be read by other people's tools.

### Rectangles use `min`/`max`

Corner points, not origin-plus-size. `min.x ≤ max.x` and `min.y ≤ max.y` are
trivially checkable, and there is no ambiguity about which corner is which.

### Validation

- Every point in a region must satisfy the surface bounds in
  [`coordinates.md` §4.1](../coordinates.md) — that is, the region is inset by
  at least one ball radius from the cushions.
- `radius > 0`; `min` strictly below `max` on both axes.
- **Non-overlap is checked between fixed points only.** A region placement is
  checked for bounds and for being non-empty, but full region-versus-ball
  feasibility — "does at least one legal position exist in this region given
  the other balls?" — is **not** implemented in `0.1`. It is recorded as a
  known gap for M2.
- Exactly one `cue` ball, whether its placement is a point or a region.

### Rendering

A region placement renders as the region outline plus a representative ball
drawn at a deterministic position — the centre for a circle, the midpoint for
a rectangle — so that a drill card is still a picture of a table rather than a
diagram of a constraint.

## Consequences

- Ball-in-hand and "anywhere on the line" drills are expressible in `0.1`
  rather than forcing a format break in M2.
- One primitive covers exact placement, variable placement, and position
  goals. Fewer concepts, and the validator and renderer each learn it once.
- `balls[].at` is a union, so consumers must branch. Contained: one type guard
  in `packages/core`, used everywhere else.
- The deferred region-feasibility check means `0.1` can validate a drill whose
  region contains no legal position. This is a documented, deliberate gap, not
  an oversight.
- Rectangles cannot express "anywhere on the head string" as a true line. A
  zero-height rectangle is rejected by `min < max`. In practice a thin
  rectangle is the honest representation — a ball placed "on the line" has a
  radius and a tolerance anyway — but the corpus should be watched for cases
  where this reads badly.

## Alternatives considered

**Exact points only in `0.1`, prose in `note`.** Simpler schema, and a
near-certain break once the corpus reaches its first ball-in-hand drill.

**A separate top-level `setup` object for starting conditions.** Keeps ball
geometry simple but creates two ways to say where the cue ball goes, and the
interaction between them would need its own rules.

**Always a region, with a `point` shape.** More uniform for tooling, noisier
for the 95% of placements that are exact — and the corpus is hand-authored, so
authoring ergonomics carry real weight.
