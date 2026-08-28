# ADR-0004: Coordinate normalization

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

"Normalized coordinates, not pixels" was the right instinct but an incomplete
specification. Three things were undefined, and each has a wrong answer that
looks reasonable:

1. **Normalized to which rectangle?** Slate, cabinet, outside rails, and
   playing surface are all plausible and all different.
2. **One scale factor or two?** The tempting choice is `x ∈ [0,1]` and
   `y ∈ [0,1]`.
3. **What precision?** Unpinned floats produce noisy diffs and unstable
   hashes.

The second question is the dangerous one. Normalizing each axis independently
means the mapping from stored coordinates to real geometry differs per axis,
so every angle in a drill is distorted by the aspect ratio. Angles are the
entire content of a pool drill.

## Decision

**Coordinates are normalized to the playing surface, cushion nose to cushion
nose, with both axes divided by the table length `L`.**

```
x  ∈  [0, 1]        head end → foot end
y  ∈  [0, W / L]    left rail → right rail
```

For the 2:1 surfaces this project targets, `y ∈ [0, 0.5]`.

Three rules follow, and all three are normative:

- **`y`'s upper bound is derived, never hardcoded.** It is `W / L`, read from
  the drill's own `authoredFor.playingSurface`. `validateDrill()` checks
  against that expression, not against the literal `0.5`. A non-2:1 surface is
  then a data question rather than a format change.
- **Coordinates are rounded to 4 decimal places on serialization.** On a
  9-foot table that is 0.01 in — far below the precision at which a ball can
  be placed. Readers accept greater precision without error.
- **Diamonds are an input and display convenience only.** `fromDiamonds()` and
  `toDiamonds()` convert at the boundary; the stored representation is always
  normalized.

Full definitions, landmarks, conversions, and worked examples live in
[`docs/coordinates.md`](../coordinates.md), which is normative.

## Consequences

- Angles and distances are preserved under the transfer of a layout between
  tables of the same aspect ratio. This is the property the whole model exists
  for.
- `x` and `y` have different ranges, which reads as asymmetric and will
  surprise anyone expecting `[0,1]²`. Accepted: it is the honest
  representation, and `coordinates.md` leads with it.
- Renderers must scale both axes by the same factor. Any renderer that fits
  the table to a viewport by stretching is wrong.
- A ball frozen on a cushion has a different normalized coordinate on each
  table size, because ball radius does not scale. See
  [ADR-0005](0005-physical-table-and-ball-dimensions.md) and
  `coordinates.md` §8.2.

## Alternatives considered

**`x ∈ [0,1]`, `y ∈ [0,1]` (independent axes).** Rejected: silently distorts
every angle, and the distortion is invisible in the data.

**Store raw inches.** Honest and unambiguous, but then every drill is bound to
one table size and transferring a layout requires rescaling at read time in
every consumer.

**Diamonds as the canonical unit.** Genuinely appealing — it is how players
think, and it matches the rails. Rejected because diamond spacing across the
width depends on aspect ratio, so the canonical unit would carry a table
assumption. Diamonds remain the authoring interface, which captures most of
the benefit.

**Normalize by width instead of length.** Equivalent mathematically; length
was chosen because `x ∈ [0,1]` on the long axis is the more natural reading
and matches how tables are described.
