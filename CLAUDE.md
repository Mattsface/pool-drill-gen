# pool-drill-gen

A tool for creating, generating, rendering, practicing, exporting, and sharing
pool drills.

**Product principle:** a drill represents both **layout** and **intention** —
where the balls are, and what the player is trying to do.

---

## Current milestone: M1 — Format Foundation

M0 is complete. The architecture and format-semantics
decisions in docs/ and the accepted ADRs are binding.

M1 creates:

- packages/schema
- packages/core
- apps/cli

M1 includes:

- experimental format 0.1
- generated TypeScript types
- precompiled Ajv validator
- semantic validateDrill()
- coordinate/diamond helpers
- fixture drills
- validate and show CLI commands

Do not begin SVG, PWA, sharing, practice logging,
generation, or other M2+ work.

### Scope discipline

Do not implement work from a later milestone unless explicitly asked. If a
task seems to require it, say so rather than quietly widening scope.

| Milestone | Contents |
|---|---|
| **M0** | Coordinate spec, ADRs, this file. No code. |
| M1 | `packages/schema`, `packages/core`, `apps/cli`. Schema `0.1`, validation, `validate` + `show` only. |
| M2 | `packages/svg`, `packages/drills`. Renderer, then 20–30 real drills to stress the schema. |
| M3 | Freeze format `1.0`. `apps/web` PWA, fragment sharing, QR, Cloudflare Static Assets. |
| M4 | Practice sessions (separate format), then template-based generation. |
| M5 | Visual editor, remix. |
| M6+ | Hosted services, only when a real limitation appears. |

---

## Frozen architecture rules

These are settled. Changing one requires a new ADR, not a commit.

### The format is the contract

- The canonical drill document must stay **portable**. It may not depend on
  React, Node, Cloudflare, IndexedDB, D1, or any application implementation.
- **Nothing may be called `v1` before M3.** The M1 schema is `0.1`.
  ([ADR-0001](docs/adr/0001-format-lifecycle-and-versioning.md))
- Hosted IDs, share slugs, and share URLs never appear inside a drill
  document.
- Practice history never appears inside a drill document.
  ([ADR-0007](docs/adr/0007-shared-drill-immutability-and-provenance.md))

### Geometry

- [`docs/coordinates.md`](docs/coordinates.md) is **normative**. If code and
  that document disagree, the code is wrong.
- Both axes are divided by table **length**. `x ∈ [0,1]`, `y ∈ [0, W/L]`.
  Never normalize the axes independently.
  ([ADR-0004](docs/adr/0004-coordinate-normalization.md))
- `y`'s bound is computed from the drill's own `playingSurface`. Never
  hardcode `0.5`.
- Coordinates are rounded to 4 decimal places on serialization.
- Pocket names are table-intrinsic: `head_left`, `head_right`, `side_left`,
  `side_right`, `foot_left`, `foot_right`. **The word `top` must not appear in
  any identifier.** ([ADR-0002](docs/adr/0002-table-intrinsic-pocket-naming.md))
- Rendering orientation is a renderer option and never affects stored data.

### Data model

- Ball identity is an opaque drill-local `id`. **Never key anything by ball
  number.** ([ADR-0003](docs/adr/0003-opaque-ball-identity.md))
- Roles in `0.1`: `cue`, `object`, `obstacle`. No `marker`.
- A placement is a point or a region; regions use `shape`, not `type`.
  ([ADR-0008](docs/adr/0008-ball-placement-points-and-regions.md))
- `shot.type` is required. `0.1` defines exactly one value: `pot`. `pocket` is
  conditionally required when `type === "pot"`.
- Do not add an untyped `constraints` bag to reserve the name. Add a specified
  structure when a real drill needs one.
- Do not pre-decide that bank and kick belong in `shot.type`. The corpus
  decides.

### Compatibility

- The published schema is **lenient**. Unknown properties are permitted.
- **Round-trips must be lossless** — a writer preserves properties it did not
  understand. Deserializing into a fixed struct and re-serializing is a bug.
  ([ADR-0006](docs/adr/0006-compatibility-and-unknown-fields.md))
- Strictness is a CLI lint flag (`--strict`), not a format rule.
- `migrate(document)` exists from M1, even as the identity function.

### Code boundaries

- `packages/core` is **platform-neutral**. No `fs`, no `process`, no `node:*`.
  Enforced by lint and a CI bundle check for browser/Worker targets.
- File I/O lives in `apps/cli` only.
- `packages/svg` returns SVG as a **string** — never a DOM node, Canvas
  object, React component, or JSX.
- JSON Schema is authoritative for shape. TypeScript types are **generated**
  from it (`json-schema-to-typescript`), with CI verifying a clean diff. Never
  hand-maintain a parallel type hierarchy.
- Ajv is **precompiled at build time** (standalone generation). Never call
  `ajv.compile()` at runtime — Cloudflare Workers forbid runtime code
  generation, and it keeps Ajv out of the PWA bundle.
- Do not scaffold packages before their milestone.

### Validation is split

- **JSON Schema** validates shape: required fields, enums, types, conditional
  requirements.
- **`validateDrill()` in core** validates meaning: exactly one cue ball,
  unique ball IDs, resolvable `ballId` references, contiguous shot numbers
  where required, positions within bounds inset by ball radius, no ball
  overlap at the authored geometry, valid regions.
- Return **structured error codes**, not strings:
  `{ code: "BALL_OVERLAP", paths: ["balls[2]", "balls[4]"], message: "…" }`

### Scope boundaries

- Geometry yes — distance, bounds, line of sight, cut angle.
  **Physics simulation no.**
- Generation means parameterized templates under geometric constraints, never
  random ball scattering. It comes after the renderer.
- Fragment shares are **unlisted / server-blind**, never described as
  "private." Anyone with the URL has the drill.

---

## Known gaps

Recorded deliberately, not overlooked. The M2 corpus is expected to press on
all of these.

- **Progressive / ladder drills.** No progression model in `0.1`.
  ([ADR-0009](docs/adr/0009-success-criteria.md))
- **Region-versus-ball feasibility.** `0.1` checks that a placement region is
  in bounds, not that a legal position exists inside it given the other balls.
  ([ADR-0008](docs/adr/0008-ball-placement-points-and-regions.md))
- **Wagon-wheel drills** — one object ball, many cue-ball positions — have no
  representation. `shots` must stay shaped so a sibling `variants` array can
  be added additively.
- **Spin, speed, and technique** live in prose notes until the corpus shows
  the right abstraction.
- **Position goals are not scored.** `success` counts pots, not position.
- **`tableSize` and `playingSurface` can drift.** The label is
  non-authoritative and mismatches warn; revisit before `1.0`.

---

## Repository layout

```
pool-drill-gen/
├── apps/
│   └── cli/                 # M1
├── packages/
│   ├── schema/              # M1
│   ├── core/                # M1
│   ├── svg/                 # M2
│   └── drills/              # M2
├── docs/
│   ├── coordinates.md       # normative
│   └── adr/
├── CLAUDE.md
├── package.json             # M1, not M0
└── pnpm-workspace.yaml      # M1
```

Dependency direction:

```
schema → core → { cli, svg, web }
```

---

## Stack

TypeScript · Node · pnpm workspaces · JSON Schema · Ajv (precompiled) ·
`json-schema-to-typescript` · Commander · Vitest · React + Vite (M3) ·
IndexedDB (M3) · Cloudflare Static Assets (M3) · GitHub Actions

Infrastructure target: **$0/month** through M3. Note that a custom domain is
the one line item that breaks this; examples using `pooldrill.app` assume a
domain that does not exist yet.
