# Architecture decision records

Short records of decisions that are expensive to reverse. Each one states the
context, the decision, and what it costs us.

A decision recorded here is **binding on implementation** until a later ADR
supersedes it. If code and an accepted ADR disagree, the code is wrong.

| # | Decision | Status |
|---|---|---|
| [0001](0001-format-lifecycle-and-versioning.md) | Drill format lifecycle and versioning | Accepted |
| [0002](0002-table-intrinsic-pocket-naming.md) | Table-intrinsic pocket naming | Accepted |
| [0003](0003-opaque-ball-identity.md) | Opaque ball identity | Accepted |
| [0004](0004-coordinate-normalization.md) | Coordinate normalization | Accepted |
| [0005](0005-physical-table-and-ball-dimensions.md) | Physical table and ball dimensions | Accepted |
| [0006](0006-compatibility-and-unknown-fields.md) | Compatibility and unknown-field preservation | Accepted |
| [0007](0007-shared-drill-immutability-and-provenance.md) | Shared-drill immutability and provenance | Accepted |
| [0008](0008-ball-placement-points-and-regions.md) | Ball placement: points and regions | Accepted |
| [0009](0009-success-criteria.md) | Practice success criteria | Accepted |

## Writing a new one

Keep it under a page. Copy the shape of an existing record: Context, Decision,
Consequences, Alternatives considered. State what the decision costs — an ADR
with no downside listed has not been thought through.

Record the decision, not the discussion. Number sequentially. Never edit an
accepted ADR's decision; write a new one that supersedes it and mark the old
one `Superseded by NNNN`.
