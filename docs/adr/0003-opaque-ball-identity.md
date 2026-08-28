# ADR-0003: Opaque ball identity

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

The obvious model is `{ number: 3, x, y }`, with shots referencing ball `3`.
It breaks in at least five cases this project will hit almost immediately:

- **Placeholder balls.** "Three object balls anywhere in the upper half" is a
  common drill shape with no numbers at all.
- **Interchangeable balls.** Progressive drills routinely use several object
  balls where the identity of each does not matter.
- **Obstacle balls.** Balls that exist only to block a line are not part of
  the shot sequence but still need positions and identity.
- **Duplicate numbers.** Nothing in a *drill* prevents two balls sharing a
  number, even though a rack does.
- **Non-pool ball sets.** Snooker's fifteen identical reds make number-keying
  impossible outright.

## Decision

**Ball numbers are display data. Identity is a separate, opaque, drill-local
ID.**

Every ball carries an `id` that is unique within the drill:

```json
{
  "id": "ball-a7f2",
  "role": "object",
  "number": 3,
  "at": { "x": 0.6200, "y": 0.1100 }
}
```

Shots reference `ballId`, never a number:

```json
{ "n": 1, "type": "pot", "ballId": "ball-a7f2", "pocket": "foot_right" }
```

`number` and `label` are optional presentation fields. **No domain
relationship may ever be keyed by ball number.**

### Roles

Format `0.1` defines exactly three:

| Role | Meaning |
|---|---|
| `cue` | The cue ball. Exactly one per drill. |
| `object` | A ball intended to be struck or potted. |
| `obstacle` | A ball present to block or constrain, never referenced by a shot. |

**`marker` is deliberately not included.** An earlier draft listed it with no
defined semantic. An undefined role is the same failure as an untyped
constraints bag: two renderers will draw it differently and the meaning will
be settled by accident rather than decision. If the drill corpus produces a
real need for a non-ball reference point, it gets added in a `0.x` bump with a
specified meaning.

### ID format

IDs are opaque strings, scoped to the drill. Implementations must not parse
them or infer meaning from them. Human-readable IDs are encouraged for
hand-authored drills (`"cue"`, `"b1"`, `"blocker-left"`) precisely because
they carry no semantics that anything depends on.

## Consequences

- Hand-authored drills carry one extra field per ball. Trivial cost.
- `validateDrill()` gains two checks: IDs unique within the drill, and every
  `ballId` in `shots` resolves to a declared ball (`UNKNOWN_BALL_REF`).
- Placeholder, duplicate, obstacle, and non-pool balls all work with no
  further format change.
- Dropping `marker` means any drill in the corpus that wants a ghost-ball
  position or target spot has nowhere to put it before the role is added
  back. Accepted — that is precisely the signal we want from the corpus.
- Renderers must not assume a ball has a number. Balls without one render
  by `label`, or plain.

## Alternatives considered

**Number as identity, with a synthetic ID only where needed.** Two identity
mechanisms, and the rules for which applies would themselves need
documenting.

**Array index as identity.** Free, and catastrophic — reordering the array or
inserting a ball silently rewires every shot in the drill.

**Keep `marker` and define it now.** Tempting, but nothing in the current
corpus needs it. Defining a role speculatively is how a format accumulates
fields that nobody uses and no reader can drop.
