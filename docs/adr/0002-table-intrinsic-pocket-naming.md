# ADR-0002: Table-intrinsic pocket naming

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

An early draft named pockets `top_left`, `top_center`, `top_right`,
`bottom_left`, `bottom_center`, `bottom_right`.

Those names only make sense if the table is drawn with its long axis
horizontal. This is a phone-first project, and the natural way to render a 2:1
table on a portrait phone screen is vertically — at which point "top_center"
names a side pocket that is nowhere near the top of anything, and the renderer
must either lie or translate.

The names also foreclose rotation. Viewing a drill from the other end of the
table — which is how you would actually want to look at it while standing
there — becomes a data problem instead of a rendering transform.

Pool tables already have unambiguous, orientation-free landmarks. There is no
reason to invent screen-relative ones.

## Decision

**Pocket identifiers are table-intrinsic. They never encode a screen
position.**

The six identifiers are:

```
head_left    head_right
side_left    side_right
foot_left    foot_right
```

The **head** end is the kitchen, where you break from. The **foot** end is
where the rack is placed.

Left and right are defined exactly once, in
[`docs/coordinates.md` §2](../coordinates.md): **standing behind the head end,
looking toward the foot end.** This is a property of the table, not of any
image, screen, or device orientation.

Rendering orientation is a renderer option — `{ orientation, flip }` — and
lives entirely outside the drill document. Portrait, landscape, and
viewed-from-the-foot-end are all transforms over the same data. **No display
choice may ever require a data migration.**

The word `top` must not appear in any pocket identifier, coordinate name, or
schema enum.

## Consequences

- Renderers gain a lookup from identifier to nominal point (tabulated in
  `coordinates.md` §5). This is six entries and it never changes.
- `head` and `foot` require the reader to know pool vocabulary. Accepted: the
  audience is pool players, and the alternative is worse.
- A drill can be rendered in any orientation, from either end, with no
  transformation of stored data. This is the whole point.
- Any future non-pool table with a different pocket arrangement will need new
  identifiers. That is a format change, correctly.

## Alternatives considered

**Numbered pockets (`p1`–`p6`).** Orientation-free and unambiguous, but
unreadable in a hand-authored JSON file — the corpus is written by hand and
`foot_left` is self-checking in a way `p5` is not.

**Compass names (`north_east`).** Same defect as `top_left`: it imposes an
absolute frame that the table does not have.

**Storing orientation in the document and keeping screen names.** Makes every
reader responsible for applying a transform correctly before it can interpret
a pocket. One reader getting it wrong produces a silently mirrored drill.
