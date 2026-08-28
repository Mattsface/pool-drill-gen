# ADR-0001: Drill format lifecycle and versioning

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

The drill document is the only artifact in this project that is genuinely
difficult to recover from a mistake. Everything else — the CLI, the renderer,
the hosting choice — can be rewritten. But once drill files exist on people's
phones, share URLs are in text messages, and QR codes are printed and taped
inside cue cases, the format is load-bearing forever.

The format therefore must not be declared stable on the day it is first
written. It has to be stressed against real drills first.

Separately, `formatVersion` was named in the plan but never given a
representation or comparison rule, which is exactly the kind of gap that
becomes annoying once files exist.

## Decision

**The format stays experimental through `0.x` and is only frozen at `1.0`
after the corpus has stressed it.**

`1.0` may only be published once all of the following hold:

- the SVG renderer exists
- 20–30 real drills have been authored
- every one of them has been rendered and visually inspected
- awkward drills have exposed schema weaknesses
- those weaknesses have been resolved without hacks

At `1.0` the format becomes a public portability contract. Before then it is
deliberately changeable, and nothing may describe it as stable.

**`formatVersion` is a string of the form `"MAJOR.MINOR"`.**

Examples: `"0.1"`, `"0.2"`, `"1.0"`, `"1.1"`. Not a number — `0.10` and `0.1`
must not collide, and numeric comparison of dotted versions is a trap.

Reader rules:

| Situation | Behaviour |
|---|---|
| Different MAJOR | **Reject.** Do not attempt to read. |
| MAJOR is `0`, MINOR differs | **Reject.** `0.x` offers no compatibility promise in either direction. |
| MAJOR ≥ 1, same MAJOR, MINOR ≤ reader's | Accept. |
| MAJOR ≥ 1, same MAJOR, MINOR > reader's | Accept, preserve unknown fields, and warn that the document uses a newer minor version. See [ADR-0006](0006-compatibility-and-unknown-fields.md). |

Patch-level changes — clarifications and schema bug fixes that do not change
the meaning of any valid document — **do not appear in `formatVersion`**. They
are revisions of the schema document, not of the format. Encoding them in
every drill file would create version churn that means nothing to a reader.

A `migrate(document)` entry point exists in `packages/core` from M1, even
while it is the identity function, so the migration path is architectural
rather than something bolted on under pressure later.

## Consequences

- Nothing in docs, code, or commit messages may call the format `v1` before
  M3. The M1 schema is `0.1`.
- `0.x` readers must pin an exact `formatVersion`. This is intentionally
  strict: it makes breakage loud during the period when the format is
  deliberately unstable.
- Two version-comparison behaviours exist (strict for `0.x`, tolerant for
  `≥1.0`). This is a small amount of branching in one function, and it buys
  freedom to change the format during exactly the phase where we need it.
- Patch-level schema fixes are invisible to documents, so a reader cannot
  detect which schema revision produced a file. Accepted: by definition those
  changes do not alter valid documents.

## Alternatives considered

**Integer `formatVersion`.** Simpler comparison, but it collapses "additive"
and "breaking" into one dimension, which the compatibility policy in
[ADR-0006](0006-compatibility-and-unknown-fields.md) needs to distinguish.

**Full semver including patch.** Adds a component that never affects document
meaning, guaranteeing churn in every stored file for no reader benefit.

**Freeze `1.0` at M1 and iterate with `1.x`.** Rejected outright. It would
make every discovery from the drill corpus a breaking change or a permanent
wart, at exactly the moment we expect to discover the most.
