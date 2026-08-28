# ADR-0009: Practice success criteria

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

`success` appeared in the format sketch as a field name with no specification,
while every neighbouring concept — balls, coordinates, shots, sequencing — got
a full definition. Since "practice success criteria" is one of the original
product goals, an unspecified `success` was the field most likely to be wrong
by default.

It also interacts with `sequencing`, which has three modes. Whatever `success`
means has to mean something sensible for all three.

## Decision

**`success` supports two modes: completing the drill, or hitting a target over
a number of attempts.**

```json
{ "mode": "run_all" }
```

```json
{ "mode": "count", "attempts": 10, "target": 7 }
```

| Field | Applies to | Rule |
|---|---|---|
| `mode` | both | Required. `"run_all"` or `"count"`. |
| `attempts` | `count` | Required, integer ≥ 1. |
| `target` | `count` | Required, integer ≥ 1, and `target ≤ attempts`. |

Conditional requirement is expressed in JSON Schema with `if`/`then`, the same
mechanism used for `pocket` on `type: "pot"` shots.

### Interaction with `sequencing`

| `sequencing` | `run_all` means | `count` means |
|---|---|---|
| `strict` | Complete every shot in order. | Attempt the sequence `attempts` times; succeed `target` times. |
| `any_order` | Pot every ball, in any order. | As above, order unconstrained. |
| `single_shot` | Make the shot once. | Make it `target` times out of `attempts`. |

Three clarifications that would otherwise be argued about later:

- **Under `any_order`, `shots[].n` is display numbering only.** It labels the
  shots in a diagram; it does not constrain the order they are attempted in.
  Under `strict`, `n` is binding and must be contiguous from 1.
- **`single_shot` with `run_all` is legal** and means "make it once." It is
  unusual but not wrong, and rejecting it would be a rule with no benefit.
- **`sequencing: "single_shot"` requires exactly one shot** —
  `shots.length === 1`. This is a semantic rule, not a shape rule: it is
  enforced by `validateDrill()` in core, not the JSON Schema.

### Deliberately excluded

**Progressive / ladder scoring** — drills that get harder on success (move the
ball back a diamond, add a ball, tighten the target) — is a real and common
category and is **not** in `0.1`. It needs a difficulty-progression model:
what changes, by how much, in what units, and what resets it. That is a
substantial design, and designing it before the corpus exists would be
guessing.

This is a **known gap**, recorded here so that it is a decision rather than an
omission. The M2 corpus is expected to contain progressive drills, and those
drills will be awkward. That is the signal.

## Consequences

- All three committed sequencing shapes — `strict`, `any_order`, and
  `single_shot` — have a meaningful success criterion in `0.1`.
- `success` says nothing about *what counts as* a successful attempt beyond
  potting the required balls — position goals are not scored. Whether
  "made the ball but missed position" is a failure is left to the player.
  Scoring position is deferred with the same reasoning as progressive drills.
- Progressive drills cannot be fully expressed in `0.1`. Their fixed portion
  is representable; the progression rule lives in `description` prose until
  the corpus shows the right abstraction.
- Practice session records reference `attempts` and `target` for stats, but
  the records themselves live in a separate local format and never inside the
  drill document. See [ADR-0007](0007-shared-drill-immutability-and-provenance.md).

## Alternatives considered

**Free prose in `0.1`.** Consistent with how spin and technique are being
handled, and defensible. Rejected because `run_all` and `count` cover the
three sequencing shapes already committed to, and prose there would make
practice logging in M4 unimplementable without a format change.

**Add progressive mode now.** Rejected: too much design ahead of the evidence.

**Score position goals as part of success.** Rejected for `0.1` for the same
reason — it needs a tolerance model and a definition of partial success, and
neither is informed by anything yet.
