# ADR-0007: Shared-drill immutability and provenance

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

"Remix this drill without modifying the original" is a stated product goal. It
raises three questions that must be answered together, because the answers
constrain each other:

- When you share a drill, can it change afterwards?
- What does a remix inherit?
- Do practice statistics follow a remix?

Getting these wrong is expensive. Whether IDs are per-drill or per-revision is
not something that can be changed after files exist, and stats attributed to
the wrong drill are worse than no stats.

There is also an attribution problem this project should not pretend away.
Many well-known drills originate in books, from instructors, or in
copyrighted materials. A sharing feature with no attribution field encourages
quiet republication.

## Decision

**A shared drill is an immutable snapshot. Remixing creates a new drill.
Statistics do not follow a remix.**

### Immutability

Once a drill has been shared, that artifact never changes. Editing a shared
drill produces a new drill; it does not mutate the shared one. This holds for
fragment-encoded shares by construction (the URL *is* the drill) and must be
preserved by any hosted storage added later.

### Remixing

A remix gets:

- a **new** `id`
- `provenance.derivedFrom` pointing at the source drill's `id`

`derivedFrom` is a **single parent pointer**, not a graph. A remix of a remix
records only its immediate parent. Reconstructing a full lineage is not a
product goal, and a DAG is a great deal of machinery for a feature nobody has
asked for.

### Provenance

```json
{
  "provenance": {
    "author": "…",
    "createdAt": "2026-08-28T14:00:00Z",
    "derivedFrom": "…",
    "license": "CC-BY-4.0"
  }
}
```

Only `createdAt` is required, as an ISO 8601 UTC timestamp.

`license` exists because attribution matters. **Do not assume every known
drill is freely republishable.** The field is optional, but the curated
builtin library should populate it, and drills of uncertain origin should say
so rather than leave it blank by default.

### Identity boundaries

- **Editing your own unshared drill keeps its `id`.** A drill you are still
  working on is one drill.
- **Sharing snapshots it.** The shared artifact is fixed from that point.
- **Editing a drill you received keeps nothing.** It is a remix: new `id`,
  `derivedFrom` set.

### Statistics

Practice statistics key on `id`. Since a remix gets a new `id`, **stats do not
carry over.** A remixed drill is a different drill — different layout, or
different intention, or both — and inherited statistics would misrepresent
performance on a shot you have never taken.

Practice data lives in a separate local format and never inside the drill
document.

### What must never be in the document

Hosted IDs, share slugs, and share URLs do not belong in the portable drill.
Hosting identity belongs to the hosting layer. `derivedFrom` refers to a
drill `id`, not to a URL.

## Consequences

- Fragment-encoded sharing satisfies immutability with no infrastructure.
- Caching a received drill is trivially correct: it can never change.
- Losing statistics on remix will occasionally annoy — tweaking one ball
  position resets your history. Accepted: the alternative silently pools
  results across drills that are not the same drill.
- Hand-authored drills need a `createdAt`. The CLI should fill this in.
- `derivedFrom` holds an `id` that a reader may have no way to resolve. That
  is acceptable — it is an attribution record, not a link.

## Alternatives considered

**Mutable shared drills with versions.** Requires version negotiation, cache
invalidation, and a mutable store. Enormous cost for a feature nobody
requested.

**Full provenance DAG.** Would enable a remix tree view. Parked until anyone
wants one.

**Stats follow the remix.** Rejected: it makes recorded performance a
statement about a drill the player never attempted.
