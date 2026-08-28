# Coordinate system and table geometry

Status: **normative for format `0.x`**
Last updated: 2026-08-28

This document defines where things are on a table. Every other part of the
project — schema, validator, renderer, CLI, PWA — derives its geometry from
here. If this document and any implementation disagree, this document is right.

Related decisions: [ADR-0002](adr/0002-table-intrinsic-pocket-naming.md),
[ADR-0004](adr/0004-coordinate-normalization.md),
[ADR-0005](adr/0005-physical-table-and-ball-dimensions.md),
[ADR-0008](adr/0008-ball-placement-points-and-regions.md).

---

## 1. The playing surface

All coordinates refer to the **playing surface**, measured **cushion nose to
cushion nose** — the rectangle a ball can actually occupy.

They do **not** refer to:

- outside rail dimensions
- cabinet or frame dimensions
- slate dimensions
- the cloth's visible edge

Two symbols are used throughout:

| Symbol | Meaning |
|---|---|
| `L` | Playing surface **length**, in inches, cushion nose to cushion nose |
| `W` | Playing surface **width**, in inches, cushion nose to cushion nose |

For the tables this project targets, `W = L / 2`:

| Nominal size | `L` (in) | `W` (in) | `W / L` |
|---|---|---|---|
| 7 ft | 78 | 39 | 0.5 |
| 8 ft | 88 | 44 | 0.5 |
| 8 ft oversize | 92 | 46 | 0.5 |
| 9 ft | 100 | 50 | 0.5 |

These are the values a drill records in `authoredFor.playingSurface`. The
nominal label (`"9ft"`) is a convenience; the inch measurements are
authoritative. See [ADR-0005](adr/0005-physical-table-and-ball-dimensions.md).

---

## 2. Ends, sides, and the observer

A pool table has two ends that are **not** interchangeable:

- the **head** end — the kitchen; where you break from
- the **foot** end — where the rack is placed

All left/right language in this project is defined from one fixed viewpoint:

> **Standing behind the head end, looking toward the foot end.**

This viewpoint is the only thing that fixes handedness, and it never changes.
It is a property of the table, not of any screen, image, or device
orientation.

---

## 3. Normalized coordinates

A position is a pair `(x, y)` of numbers.

**Both axes are divided by the table length `L`.** One scale factor, not two.

| Axis | Direction | Range |
|---|---|---|
| `x` | Head end → foot end, along the long axis | `[0, 1]` |
| `y` | Left rail → right rail, across the short axis | `[0, W / L]` |

For a standard 2:1 surface this makes `x ∈ [0, 1]` and `y ∈ [0, 0.5]`.

```
                 y = 0   (left rail)
        ┌──────────────────────────────┐
        │                              │
 x = 0  │  head                  foot  │  x = 1
        │                              │
        └──────────────────────────────┘
                 y = W/L (right rail)
```

Dividing both axes by `L` is what preserves real geometric angles. Normalizing
each axis independently to `[0, 1]` would stretch one axis relative to the
other and silently distort every angle in a drill — and angles are the entire
content of a pool drill. See [ADR-0004](adr/0004-coordinate-normalization.md).

### 3.1 The `y` bound is derived, not assumed

`y`'s upper bound is **not** hardcoded to `0.5`. It is:

```
y_max = W / L
```

taken from the drill's own `authoredFor.playingSurface`. On every table this
project currently targets that evaluates to `0.5`, but the rule is written in
terms of `W / L` so that a non-2:1 surface is a data question rather than a
format change.

`validateDrill()` checks positions against `W / L`, never against a literal.

### 3.2 Serialization precision

Coordinates are **rounded to 4 decimal places when serialized**.

On a 9-foot table one unit in the fourth decimal place is `0.0001 × 100 in =
0.01 in` — well below the precision at which anyone can place a ball. Fixed
precision keeps diffs readable and keeps any future content hashing stable
across runtimes.

Implementations round on write. Readers must accept more precise input without
error.

---

## 4. Ball radius in normalized units

A ball's radius matters for bounds and overlap checks, and it does **not**
scale with the table.

```
r = (ballDiameterIn / 2) / L
```

For a standard 2¼″ ball:

| Nominal size | `L` (in) | `r` (normalized) | Minimum centre separation `2r` |
|---|---|---|---|
| 7 ft | 78 | 0.014423 | 0.028846 |
| 8 ft | 88 | 0.012784 | 0.025568 |
| 8 ft oversize | 92 | 0.012228 | 0.024457 |
| 9 ft | 100 | 0.011250 | 0.022500 |

Note that `r` grows as the table shrinks. This is the single most important
consequence of normalizing: **a layout that is legal on a 9-foot table is not
automatically legal on a 7-foot table.** See §8.3 for a worked example.

### 4.1 Bounds

A ball's **centre** may not be closer to a cushion than one radius:

```
r  ≤  x  ≤  1 - r
r  ≤  y  ≤  (W / L) - r
```

A ball whose centre sits exactly at `x = r` is *frozen* on the head cushion —
touching it, not overlapping it. Positions expressed as `x = 0` are invalid,
not "against the rail."

### 4.2 Non-overlap

For any two balls with centres `a` and `b`:

```
distance(a, b)  ≥  2r
```

Equality means frozen together. Anything less is physically impossible and is
a validation error (`BALL_OVERLAP`).

---

## 5. Pockets

Pocket identifiers are **table-intrinsic**. They never encode a screen
position. See [ADR-0002](adr/0002-table-intrinsic-pocket-naming.md).

| Identifier | Nominal position `(x, y)` — standard 2:1 | General |
|---|---|---|
| `head_left` | `(0.00, 0.00)` | `(0, 0)` |
| `head_right` | `(0.00, 0.50)` | `(0, W/L)` |
| `side_left` | `(0.50, 0.00)` | `(0.5, 0)` |
| `side_right` | `(0.50, 0.50)` | `(0.5, W/L)` |
| `foot_left` | `(1.00, 0.00)` | `(1, 0)` |
| `foot_right` | `(1.00, 0.50)` | `(1, W/L)` |

Left and right are as defined in §2 — standing behind the head end looking
toward the foot end.

These are **nominal aiming points** at the intersection of the cushion noses.
Real pockets have a mouth width and cut-back jaws, and their true geometric
centre lies slightly outside the playing surface. Format `0.x` does not model
pocket mouth width, jaw angle, or pocket cut. A pocket is an identifier, and
the nominal point above is what a renderer draws toward.

---

## 6. Standard landmarks

These are the fixed reference points every pool player already uses. Drills
cite them constantly, so they are named here in normalized units.

| Landmark | `x` | `y` | Notes |
|---|---|---|---|
| Head cushion | `0.00` | — | |
| **Head string** | `0.25` | — | Line across the table; the kitchen's boundary |
| **Centre string** | `0.50` | — | Line across the table at the side pockets |
| **Foot string** | `0.75` | — | Line across the table through the foot spot |
| Foot cushion | `1.00` | — | |
| **Long string** | — | `0.25` | Centre line running head-to-foot (`(W/L)/2`) |
| **Head spot** | `0.25` | `0.25` | Head string × long string |
| **Centre spot** | `0.50` | `0.25` | Centre of the table |
| **Foot spot** | `0.75` | `0.25` | Where the apex ball is racked |

The **kitchen** is the region between the head cushion and the head string:

```
x ∈ [0, 0.25]
```

Constrained for a ball centre, allowing for radius (§4.1):

```
x ∈ [r, 0.25],   y ∈ [r, (W/L) - r]
```

That rectangle is exactly what a "ball in hand behind the head string" drill
should express as a placement region. See
[ADR-0008](adr/0008-ball-placement-points-and-regions.md).

---

## 7. Diamonds

Rail diamonds divide the **long rail into 8 equal segments** and the **short
rail into 4**. Players think and talk in diamonds, and every bank and kick
system in existence is expressed in them, so hand-authoring must not require
raw decimals.

Diamond coordinates `(dx, dy)` have origin at the `head_left` corner:

```
dx ∈ [0, 8]    along the length, head → foot
dy ∈ [0, 4]    across the width, left → right
```

### 7.1 Conversion

```
x  =  dx / 8
y  =  dy × (W / L) / 4

dx =  x × 8
dy =  y × 4 × (L / W)
```

On a standard 2:1 surface this simplifies pleasantly — one diamond is `0.125`
on **both** axes, so `x = dx/8` and `y = dy/8`, and diamonds are square:

| | Per diamond, `x` | Per diamond, `y` (2:1) |
|---|---|---|
| Normalized | `0.1250` | `0.1250` |

Core exposes `fromDiamonds()` / `toDiamonds()` (M1). The CLI accepts diamond
input such as `--at 3.5,2`, converted immediately to canonical coordinates.
Diamonds are an **input and display convenience only** — they are never the
stored representation.

### 7.2 Landmarks in diamonds

| Landmark | `(dx, dy)` |
|---|---|
| `head_left` | `(0, 0)` |
| `head_right` | `(0, 4)` |
| `side_left` | `(4, 0)` |
| `side_right` | `(4, 4)` |
| `foot_left` | `(8, 0)` |
| `foot_right` | `(8, 4)` |
| Head string | `dx = 2` |
| Centre spot | `(4, 2)` |
| Foot spot | `(6, 2)` |

---

## 8. Worked examples

These exist so that another engineer can verify an implementation against this
document rather than trusting it. Every number below is checked arithmetic.

### 8.1 The foot spot on three tables

Normalized position is identical on all three; the physical position is not.
(The 8 ft standard profile, at 88 × 44, is omitted from this worked example
but follows the same arithmetic: `x = 66.00 in`, `y = 22.00 in` from the head
and left cushions respectively.)

| Table | `(x, y)` | From head cushion | From foot cushion | From left cushion |
|---|---|---|---|---|
| 9 ft | `(0.7500, 0.2500)` | 75.00 in | 25.00 in | 25.00 in |
| 8 ft oversize | `(0.7500, 0.2500)` | 69.00 in | 23.00 in | 23.00 in |
| 7 ft | `(0.7500, 0.2500)` | 58.50 in | 19.50 in | 19.50 in |

In each case the foot spot is one quarter of the table length from the foot
cushion and centred across the width — which is the definition. The normalized
form transfers exactly. ✅

### 8.2 A ball frozen on the foot cushion, centred

"Frozen" means touching: the centre is exactly one radius from the cushion
nose, so `x = 1 - r`.

| Table | `r` | `x = 1 - r` | Centre from foot cushion |
|---|---|---|---|
| 9 ft | 0.011250 | `0.98875` | 1.1250 in |
| 8 ft oversize | 0.012228 | `0.98777` | 1.1250 in |
| 7 ft | 0.014423 | `0.98558` | 1.1250 in |

The physical clearance is correctly 1.125 in — one ball radius — on every
table. But **the normalized coordinate differs on each one.** A frozen ball is
not a portable coordinate; it is a coordinate computed from the table it was
authored for.

This is the clearest illustration of why `authoredFor.playingSurface` and
`ballSet.ballDiameterIn` are required fields rather than nice-to-haves.

### 8.3 A layout that does not transfer

Two object balls with centres `0.0250` apart in normalized units:

| Table | Physical separation | Required (`2r` = ball diameter) | Result |
|---|---|---|---|
| 9 ft | 2.500 in | 2.25 in | ✅ legal, 0.25 in gap |
| 8 ft oversize | 2.300 in | 2.25 in | ✅ legal, but effectively frozen |
| 7 ft | 1.950 in | 2.25 in | ❌ **overlapping — impossible** |

A drill authored on a 9-footer with this spacing is not merely harder on a bar
box; it cannot be set up at all. `validateDrill()` must reject it with
`BALL_OVERLAP` when checked against 7-foot geometry.

This is what "a drill may be practiced on another table if feasibility checks
pass" means in practice, and why the check is not optional.

### 8.4 Ball in hand behind the head string, 9-foot table

Expressed as a rectangular placement region, inset by one ball radius:

```json
{
  "shape": "rect",
  "min": { "x": 0.0113, "y": 0.0113 },
  "max": { "x": 0.2500, "y": 0.4888 }
}
```

`0.0113` is `r = 0.01125` rounded to 4 dp; `0.4888` is `0.5 - 0.01125`
rounded. The region's `max.x` is the head string at `0.25` exactly, because a
cue ball placed with its centre on the head string is behind the line under
standard rules only if it is *not past* it — implementations treat the
boundary as inclusive.

### 8.5 Canonical render mapping

The canonical reference render is **landscape, head end on the left, foot end
on the right, viewed from above**.

Under the handedness defined in §2, an observer behind the head end facing the
foot has the `y = 0` rail on their left, which in that top-down image is the
**top** edge. So the mapping to SVG user space is a pure scale with no flip:

```
svgX = x * scale
svgY = y * scale
```

This is not a coincidence — the handedness in §2 was chosen so that the
canonical render needs no transform. Portrait, and viewing from the foot end,
are rendering transforms applied on top of this. Neither ever changes the
data.

---

## 9. What this document does not define

Deliberately out of scope for `0.x`:

- pocket mouth width, jaw angle, or pocket cut
- cushion nose profile or rail height
- cloth speed, humidity, or any table condition
- ball weight, friction, or restitution
- anything that would require simulating a collision

The project needs geometry — distance, bounds, line of sight, cut angle — and
explicitly not physics. That boundary holds.
