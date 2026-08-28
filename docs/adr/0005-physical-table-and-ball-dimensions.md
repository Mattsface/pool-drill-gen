# ADR-0005: Physical table and ball dimensions

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

A nominal label like `"9ft"` is convenient but not sufficient. It tells a
reader roughly what table the author had, but it does not let any
implementation check whether a layout is physically possible without
consulting a private registry of table profiles — which would make the format
non-portable in exactly the way we said it must not be.

The problem is concrete. Standard playing surfaces are all 2:1, so a
normalized layout transfers geometrically between table sizes. **But the ball
does not scale.** A 2¼″ ball is 0.0225 of a 9-footer's length and 0.0288 of a
7-footer's. A layout that is tight but legal on a 9-foot table can be
physically impossible on a bar box — the balls overlap.

Without physical dimensions in the document, nothing can detect that.

## Decision

**Every drill records the actual playing geometry it was authored for,
alongside the convenient nominal label.**

```json
{
  "authoredFor": {
    "tableSize": "9ft",
    "playingSurface": { "lengthIn": 100, "widthIn": 50 },
    "ballSet": { "ballDiameterIn": 2.25 }
  }
}
```

- `playingSurface` is measured **cushion nose to cushion nose**, in inches.
- `tableSize` is a **label**, not data. Where the two disagree, the inch
  measurements are authoritative. `validateDrill()` warns on an implausible
  pairing but never derives geometry from the label.
- Inches are the wire unit. Authoring tools working in millimetres convert at
  the boundary. One unit, stated once, beats a units field that every reader
  must handle.

Derived quantities, all defined in
[`docs/coordinates.md`](../coordinates.md):

```
y_max = W / L                      surface bound
r     = (ballDiameterIn / 2) / L   ball radius, normalized
```

`validateDrill()` uses these for:

- **bounds** — a ball centre satisfies `r ≤ x ≤ 1-r` and `r ≤ y ≤ y_max - r`
- **non-overlap** — every pair of centres is at least `2r` apart
  (`BALL_OVERLAP`)

**Feasibility is checkable against a table other than the authoring one.** A
drill is authored for one physical setup and may be practiced on another if
the checks pass against that table's geometry. This is a first-class operation,
not an afterthought: it is what makes a shared drill useful to someone with a
different table.

## Consequences

- Every drill document grows by three small objects. Measurable against the
  fragment-sharing size budget in M3; expected to be noise after compression.
- Any implementation, in any language, can check physical feasibility from the
  document alone. No table registry, no shared constant table.
- Two representations of table size coexist (`tableSize` and
  `playingSurface`), which can drift. Mitigated by making the label
  non-authoritative and warning on mismatch — but it is a real cost and worth
  revisiting before `1.0`.
- Hand-authoring requires knowing your table's real playing dimensions. The
  CLI should offer the three standard profiles as defaults so this is a flag,
  not homework.
- A ball frozen on a cushion is not a portable coordinate — it is computed
  from the table it was authored for. See `coordinates.md` §8.2.

## Alternatives considered

**Nominal size only.** The original plan. Rejected: makes physical feasibility
uncheckable without out-of-band data, and the whole point of the format is
that the document is self-contained.

**Physical dimensions only, no label.** Cleaner in principle, but `"9ft"` is
how every human describes a table and dropping it makes drill listings and CLI
output worse for no correctness gain.

**A table-profile registry keyed by label.** Would keep documents small, but
introduces a shared dependency that every implementation must have and keep in
sync. That is precisely the portability failure this format exists to avoid.
