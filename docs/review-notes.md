# Pre-implementation review notes

Status: **open — not yet incorporated into the plan**
Date: 2026-08-28
Scope: architecture, monorepo boundaries, and drill schema, reviewed before any
implementation code was written.

This document is written to be actionable two ways: as a checklist for the
project itself, and as a brief that can be handed to an assistant to revise the
existing plan. Where a point is disputed, argue it here rather than deleting it.

---

## Core finding

The stack is fine; the schema is the risk.

The plan treats the drill schema as an M0 setup chore, but it is the only
artifact in this project that is genuinely unrecoverable once drill files exist
on phones, share URLs are in text messages, and QR codes are printed. Commander,
the renderer, and Cloudflare are all replaceable. The format is not.

**The schema must not be frozen as `v1` until a renderer exists and 20–30 real
drills have been authored and visually reviewed.**

---

## Five blocking decisions

### 1. Pocket names are screen coordinates

`top_left` / `top_center` / `bottom_*` assumes a horizontally-drawn table. This
is a phone-first PWA that will render 2:1 tables in portrait, where those names
are simply wrong. The naming also forecloses viewing a drill from the other end
of the table — a rendering transform becomes a data problem.

**Decision:** use table-intrinsic names — `head_left`, `head_right`,
`side_left`, `side_right`, `foot_left`, `foot_right`. Left/right is defined once,
as seen from behind the head (kitchen) end looking toward the foot end.
Orientation then belongs to the renderer and never to the data.

### 2. Balls need opaque IDs, not numbers

Keying shots by ball number breaks on:

- placeholder balls ("three object balls anywhere in the upper half")
- duplicate / interchangeable balls in progressive drills
- obstacle balls that block a line but aren't in the sequence
- ghost-ball and target markers, which aren't balls at all
- snooker's fifteen identical reds, if ever in scope

**Decision:** every ball gets an `id` unique within the drill, plus
`role: cue | object | obstacle | marker`. `number` and `label` are optional and
display-only. Shots reference `ballId`.

### 3. "Normalized coordinates" is underspecified

- Normalize to the **playing surface**, cushion nose to cushion nose — not the
  slate, rail, or cabinet. State this explicitly; every future importer will
  otherwise guess differently.
- Use **one scale factor, not two**: `x ∈ [0,1]` along the long axis,
  `y ∈ [0,0.5]` across, both divided by table *length*. Normalizing each axis
  independently to `[0,1]` silently distorts every angle on any non-2:1
  surface, and angles are the entire content of a pool drill.
- **Table size is not cosmetic.** WPA playing surfaces are all 2:1 (9ft ≈
  100×50in, 8ft ≈ 92×46, 7ft ≈ 78×39), so layouts transfer geometrically — but
  the ball does not scale. A 2¼″ ball is 0.0225 of a 9-footer's length and
  0.0288 of a 7-footer's, so a layout that is tight-but-legal on a 9ft can be
  physically impossible on a bar box. Add required `authoredFor.tableSize` and a
  core feasibility check that converts to inches and verifies no two balls
  overlap.
- Pin coordinate precision at **4 decimal places**, rounded on write (≈0.01″ on
  a 9-footer). Keeps hashes stable and diffs readable.
- Ship `toDiamonds()` / `fromDiamonds()` and let the CLI accept diamond input
  (`3.5,2`). Players think in diamonds and every bank/kick system is expressed
  in them; hand-authoring in decimals is miserable. One diamond = 0.125 in `x`.

### 4. A required target pocket makes safeties a breaking change

"Explicit intended target pocket for each shot" covers pots and nothing else.
Safeties, kicks, banks, two-way shots, breakouts, and caroms have intent with no
pocket — or a pocket plus a rail requirement.

**Decision:** add a required `shot.type` now, with exactly one legal value in v1
(`"pot"`), and make `pocket` conditionally required only when `type === "pot"`
(JSON Schema `if`/`then`). Adding `"safety"` later is then purely additive, and
a v1.0 reader encountering `"type": "bank"` can *detect* an unsupported feature
instead of silently misrendering it as a normal pot. Reserve — but do not
implement — a `constraints` key for rail requirements.

### 5. Practice logs must not live in the drill document

Two separate formats: a shareable drill document, and a local, append-only
session log (JSONL is fine for v0.1) that references drills by ID. Otherwise
every shared drill leaks attempt history and stops being portable.

Decide alongside it: **do stats follow a remix?** Recommendation is no — a remix
is a new ID with a `derivedFrom` pointer, and stats key on the ID. This
determines whether IDs are per-drill or per-revision, which cannot be changed
once files exist.

---

## Stack corrections

- **Ajv cannot compile schemas inside a Cloudflare Worker.** `ajv.compile()`
  uses `new Function`, which Workers block (`EvalError: Code generation from
  strings disallowed`). Precompile to a standalone validator module at build
  time with `ajv/dist/standalone`. This also removes Ajv from the PWA bundle and
  makes validation a pure function with no startup cost. Structure for this at
  M0, not at deploy time. `@cfworker/json-schema` is the fallback if
  runtime-dynamic schemas are ever needed.
- **Generate the TypeScript types from the JSON Schema**
  (`json-schema-to-typescript`), commit the output, and add a CI check that
  regeneration produces no diff. Never hand-maintain both — drift between a
  validator and a type is the kind where the compiler and the runtime disagree
  and the tests still pass.
- **Split validation explicitly.** JSON Schema validates *shape*; a
  `validateDrill()` in core validates *meaning* — ball reference integrity,
  exactly one cue ball, contiguous shot numbering, ball overlap at the authored
  table size. Return structured error codes (`UNKNOWN_BALL_REF`,
  `BALLS_OVERLAP`), not strings, so CLI, editor, and API can present them
  differently.
- **Move `schema/` into the workspace** as `packages/schema`, exporting the raw
  `.json`, the generated types, and the precompiled validator. A top-level
  directory outside the workspace has no clean import story for a Worker or a
  browser bundle. Same for `drills/builtin` → `packages/drills` with a generated
  index; its job in CI is to be validated on every commit.
- **Don't scaffold empty packages.** Create `packages/svg` and `apps/web` in the
  milestone that fills them. An empty package is a tsconfig, a build script, and
  a CI target maintained for months before it does anything.
- **Enforce mechanically that `core` imports zero Node built-ins** — no `fs`, no
  `process`. Lint rule plus a CI job that bundles core for a Worker target. The
  predictable failure is core reading the schema with `fs.readFileSync`, working
  for two milestones, then not running in a Worker. File I/O lives in
  `apps/cli` only.
- **`packages/svg` returns a string**, not a DOM node or JSX, so it works in
  Node (CLI export), in a Worker (share cards), and in the browser.
- **Rendering options carry orientation, not the data:**
  `{ orientation, flip, tableSize }`.
- **Format version ≠ package version.** The drill format gets its own version,
  moved deliberately.

---

## Sharing can ship with no backend

A drill is a few hundred bytes. Deflate + base64url it into the **URL fragment**
(`/d#p=…`). The fragment never reaches the server, so shares are private by
construction; the site stays fully static; it works offline; there is no storage
cost, no abuse surface, and no moderation obligation — and it is directly
QR-encodable, since a QR code carries far more than a drill needs.

This collapses the planned v0.3 and v0.4 into one static milestone.

Add KV or D1 only when fragments genuinely fail: short memorable URLs, oversized
drills, search and discovery, view counts. When that happens:

- **Content-address shared drills:** `id = base32(sha256(canonicalJSON))[:10]`.
  Idempotent writes, free dedupe, client-verifiable integrity — and immutability
  makes PWA caching trivially correct.
- **Define a canonical serialization** (RFC 8785 / JCS). Key order, unicode
  escaping, and float formatting differ across Node, browsers, and Workers,
  which breaks hashing, dedupe, and cache keys.
- **Choose the store by access pattern.** Immutable id→blob reads are a KV
  workload; D1 only for relational queries (search by tag, remix trees).
- **An unauthenticated write endpoint is an abuse surface.** Minimum: hard size
  cap, schema validation before storage, rate limiting, takedown denylist.
- **Never put a hosted ID or share URL inside the drill document.** Hosting
  identity belongs to the hosting layer. The document may carry an optional,
  explicitly non-authoritative `source` hint.

---

## Storage durability

IndexedDB is the right choice, but WebKit evicts script-writable storage for
origins without recent user interaction, exempting origins whose storage is in
persistent mode — which WebKit grants heuristically, notably for Home Screen web
apps. For an app used once a week, that risks losing exactly the data the
adaptive-practice endgame depends on.

Call `navigator.storage.persist()`, actively prompt Add to Home Screen, and
treat **export to file** as a first-class feature. Wrap IndexedDB behind a
repository interface in core so sync can slot in later — but don't build sync
until someone actually loses data on a second device.

---

## Schema v1 scope

The test for inclusion is not "will we need this?" but **"is adding this later a
breaking change?"** Discriminators and IDs go in early because retrofitting them
isn't additive. Features go in late.

### In

| Field | Notes |
|---|---|
| `format`, `formatVersion` | Magic string + integer. Refuse to parse without them. |
| `id` | ULID or UUIDv7 — sortable, offline-generatable. |
| `title`, `description` | Description optional, plain text. |
| `authoredFor.tableSize` | `7ft \| 8ft \| 9ft`. Required; feasibility checks depend on it. |
| `authoredFor.ballSet` | Single value `american-pool` in v1. The hinge for snooker/carom later. |
| `game` | Optional enum, default `practice`. |
| `balls[].{id, role, at}` | `role: cue \| object \| obstacle \| marker`. |
| `balls[].{number, label}` | Optional, display-only, never a key. |
| `sequencing` | `strict \| any_order \| single_shot`. Covers non-runout drills without a graph. |
| `shots[].{n, type, ballId}` | `type` required, only `"pot"` legal in v1. |
| `shots[].pocket` | Required when `type === "pot"` via `if`/`then`. |
| `shots[].position` | A `Region`, not a point — nobody lands the cue ball on a point. |
| `Region` primitive | `circle` and `rect` only. Highest-leverage type in the schema: reused for position goals, placement tolerance, and later scoring zones. |
| `shots[].note` | Free text. Where "stun across, don't get straight" lives. |
| `success` | `{ mode: run_all \| count, attempts?, target? }`. |
| `skills[]`, `difficulty`, `tags[]` | Small controlled vocabulary for `skills`. The whole adaptive roadmap depends on this existing early. |
| `provenance` | `{ author?, createdAt, derivedFrom?, license? }`. Single parent, not a DAG. Include `license` — many classic drills come from books and instructors. |
| `extensions` | Free-form object, reserved, must survive round-trips. |

### Out

| Field | Why |
|---|---|
| Cue-ball paths | A path is a *consequence*, not an intention. Storing it turns the schema into a drawing format. Derive arrows at render time. |
| Annotations (arrows, text, zones) | Defer; when it lands, mark it explicitly non-semantic and ignorable. |
| English / spin / speed | Real intent, but unclear whether it's an enum, a vector, or prose. Let `note` absorb it and observe what actually gets written. |
| Shot rail constraints | Reserve the key name only. |
| `variants` / progressive drills | Wagon-wheel drills are a real category. Design `shots` so a sibling `variants` array can be added additively. |
| Pocket cut / table conditions | Bucket vs pro-cut genuinely changes difficulty, but it's a v2 hint. |
| Practice attempts and stats | Separate schema entirely. |
| Hosted URL / D1 id / share slug | Violates portability. |

### Compatibility policy — write this down at M0

Major = breaking, minor = additive, and **readers must tolerate *and preserve*
unknown properties on round-trip**. A v1.0 tool that opens, edits, and
re-exports a v1.3 drill must not silently drop fields it didn't understand —
that's how remixing quietly destroys data.

So the published schema stays lenient, and the CLI gets a `--strict` lint mode
that *warns* on unknown keys to catch authoring typos. Ship a `migrate(doc)`
function in core from day one, even when it's the identity function.

### Coordinate contract

Origin is the head-end left corner of the playing surface (cushion nose to
cushion nose), viewed from behind the head end. `x` runs 0→1 head to foot along
the long axis. `y` runs 0→0.5 left to right, using the same scale factor as `x`.
Values rounded to 4 decimal places. Ball centers, not edges. One diamond = 0.125
in `x`.

### Strawman document

```json
{
  "format": "pooldrill",
  "formatVersion": 1,
  "id": "01K4ZQ8N7M3PVYX2",
  "title": "Stun across, two-ball position",
  "authoredFor": { "tableSize": "9ft", "ballSet": "american-pool" },
  "game": "9ball",
  "sequencing": "strict",

  "balls": [
    { "id": "cue", "role": "cue",    "at": { "x": 0.2500, "y": 0.2500 } },
    { "id": "b1",  "role": "object", "number": 1, "at": { "x": 0.6200, "y": 0.1100 } },
    { "id": "b2",  "role": "object", "number": 2, "at": { "x": 0.8000, "y": 0.3800 } },
    { "id": "x1",  "role": "obstacle",           "at": { "x": 0.7000, "y": 0.2400 } }
  ],

  "shots": [
    {
      "n": 1,
      "type": "pot",
      "ballId": "b1",
      "pocket": "foot_right",
      "position": {
        "shape": "circle",
        "center": { "x": 0.5500, "y": 0.3000 },
        "radius": 0.0500
      },
      "note": "Stun across. Do not get straight on the 2."
    },
    { "n": 2, "type": "pot", "ballId": "b2", "pocket": "side_right" }
  ],

  "success":    { "mode": "count", "attempts": 10, "target": 6 },
  "skills":     ["cut-shot", "stun", "position-play"],
  "difficulty": 3,
  "tags":       ["two-ball", "foot-end"],

  "provenance": {
    "author":    "Matt",
    "createdAt": "2026-08-28T14:00:00Z",
    "license":   "CC-BY-4.0"
  }
}
```

---

## Revised milestone sequence

**M0 — Decisions, not code.** Half a day. Produce `docs/coordinates.md` and
short ADRs for pocket naming, ball identity, coordinate normalization, and the
compatibility policy. No `package.json` yet. Cheapest milestone in the project,
highest leverage.

**M1 — Foundation.** `packages/schema` + `packages/core` only. Schema authored
as JSON Schema, types generated, Ajv precompiled to standalone.
`validateDrill()` with structured errors. Canonicalization and hashing with
precision pinned. Five hand-authored fixture drills with round-trip and
golden-file tests. CLI does exactly two things: `validate` and `show`. Call the
format **0.1** — do not write "v1" anywhere yet.

**M2 — SVG renderer, earlier than originally planned.** This is the biggest
sequencing change. The renderer is not a v0.2 feature; it is the authoring and
debugging tool. You cannot review a drill by reading JSON, and until you've
looked at 30 rendered drills you don't know what the schema is missing. Ship
`renderDrill() → string`, `pooldrill show --svg`, both orientations, pocket
highlighting, shot-order numbering. Then expand the library to 20–30 drills,
*looking at each one*. Every drill that's hard to express is a schema finding.

**M3 — Freeze, then build outward.** Promote the format to **1.0** based on what
the library taught you, and write the compatibility guarantee into the docs.
Then the React + Vite PWA, IndexedDB behind a repository interface,
`navigator.storage.persist()`, export-to-file, Cloudflare Static Assets (no
Worker logic yet), and fragment-encoded share URLs **and** QR codes.

**M4 — Practice, then generation.** Separate log format, local only. Then
generation — now reviewable, because you can render the output.

**M5+ — Only if the pain is real.** Worker + KV/D1 short links, visual editor,
remixing. None of these should be scheduled in advance.

Net effect: sharing and QR arrive two milestones earlier with no backend;
practice logging slips by roughly one milestone; the schema is frozen only after
it has been visually validated.

---

## "Generate" needs defining

It is the least-specified item in the plan and the hardest to do well. Random
ball placement produces garbage — frozen balls, shots with no line to any
pocket, layouts impossible on the target table.

Specify it as **parameterized templates plus feasibility constraints**:
line-of-sight from cue ball to object ball to pocket, non-overlap, minimum cut
angle — reusing the geometry the validator already needs. This is why it must
come after the renderer.

Note this is geometry, not physics. The "no simulation" decision stands: you
never model a collision *outcome*, only whether a line is clear.

---

## Open questions

Each one changes the schema.

1. Is the drill format a public contract, or just personal interchange? If other
   tools should read it, v1 needs published `$id` URLs, a stability guarantee,
   and real rigor. If not, v0.x can move fast and break things.
2. Is a drill always a sequence, or is a single shot repeated 50 times also a
   drill? Much of real practice is the latter.
3. Are drills authored for one table size, or size-agnostic? Determines whether
   the feasibility check is an error or a warning.
4. Will snooker or non-2:1 tables ever be in scope? Fifteen identical reds is
   the case that definitively settles ball identity.
5. **Is spin/technique part of a drill's "intention"?** The stated product
   principle is layout + intention, and "draw two diamonds" is intention that a
   cue-ball landing zone doesn't capture. Biggest open question in the model.
6. Are shared drills immutable, or editable in place? Immutable +
   content-addressed makes caching, dedupe, and provenance nearly free.
7. Do practice stats follow a remix?
8. Is the audience personal, or public? Public sharing brings moderation and
   takedown obligations to an anonymous write endpoint.
9. Describe three concrete drills `generate` should produce, with ball counts
   and constraints.
10. Portrait or landscape as the canonical render? It shouldn't affect the data
    once pocket naming is fixed — which is why answering it confirms the fix.

---

## References

- [WebKit — Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [MCP TypeScript SDK #689 — Ajv code generation on Workers](https://github.com/modelcontextprotocol/typescript-sdk/issues/689)
- [ajv #2318 — edge runtime support](https://github.com/ajv-validator/ajv/issues/2318)
- [@cfworker/json-schema](https://www.npmjs.com/package/@cfworker/json-schema)
- [WPA Recommended Equipment Specifications](https://wpapool.com/wp-content/uploads/2024/01/RECOMMENDED-EQUIPMENT-SPECIFICATIONS.pdf)
