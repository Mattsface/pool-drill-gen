# ADR-0006: Compatibility and unknown-field preservation

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

Once drills are shared and remixed, multiple versions of the tooling read and
write the same documents. The dangerous case is not a reader that fails
loudly — it is a reader that succeeds quietly and loses information.

Concretely: a `1.0` editor opens a `1.3` drill, does not understand two of its
fields, edits the title, and re-exports. If unknown fields are dropped, the
remix has silently destroyed data that the author cared about, and nobody
finds out until much later.

This forces a choice on `additionalProperties` that cannot be reversed
quietly, because it determines what every already-written file means.

## Decision

**Major means breaking. Minor means additive. Readers tolerate and preserve
what they do not understand.**

| Change | Version bump |
|---|---|
| Removing a field, changing a field's meaning, tightening a constraint, removing an enum value | MAJOR |
| Adding an optional field, adding an enum value, relaxing a constraint | MINOR |
| Clarifying wording, fixing a schema bug that does not change any valid document's meaning | Neither — see [ADR-0001](0001-format-lifecycle-and-versioning.md) |

Three rules bind implementations:

1. **The published schema is lenient.** Unknown properties are permitted.
   `additionalProperties: false` would make every additive change break every
   older reader, which is the opposite of what MINOR is supposed to mean.

2. **Round-trips are lossless.** A tool that reads a document and writes it
   back must preserve properties it did not understand, in place. This is not
   optional and it is the single most important rule in this ADR. Remixing is
   a core feature; a lossy round-trip makes remixing destructive.

3. **Strictness is a lint mode, not a format rule.** Leniency lets typos
   through, so the CLI gets `pooldrill validate --strict`, which *warns* on
   unknown properties. Warnings during authoring, tolerance during reading.

`extensions` remains available as the declared place for application-specific
data, so that experimentation has a home that is unambiguously not part of the
format. It carries the same preservation guarantee.

`0.x` is exempt from all of this. Per ADR-0001, `0.x` readers pin an exact
version and offer no compatibility promise in either direction.

## Consequences

- Additive format evolution never breaks an existing reader. This is what
  makes `1.x` sustainable for a project maintained by one person.
- Implementations cannot naively deserialize into a fixed struct, mutate, and
  re-serialize — that drops unknown fields. Every writer must retain the
  parsed source. This is a real constraint on `packages/core`'s design and
  must be handled in M1, before there is anything to lose.
- Typos in hand-authored drills are not caught by default validation. Mitigated
  by `--strict`, which the corpus authoring workflow should use by default.
- Round-trip preservation needs a test from day one: parse a document with
  unknown fields, write it, assert byte-equivalence modulo formatting. That
  test goes in M1 alongside the golden-file tests.

## Alternatives considered

**`additionalProperties: false`.** Catches typos beautifully and makes every
minor version break every older reader. Rejected — it would mean the format
has only breaking changes, whatever the version number claims.

**Strict on read, lenient on write.** Backwards. It rejects newer documents
outright rather than degrading gracefully, which is the failure mode users
notice most.

**Two schemas, one strict and one lenient.** Considered, and it is a
reasonable pattern. Rejected for now as more machinery than a one-person
project needs: a `--strict` flag over one lenient schema gets the same
practical benefit.
