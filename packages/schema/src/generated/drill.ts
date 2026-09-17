/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand.
 * Generated from src/schema/drill.schema.json by `pnpm schema:types`.
 */

/**
 * Either an exact point or a region (ADR-0008). Discrimination is by the presence of `shape`: a placement with no `shape` is a point. One primitive covers exact placement, variable placement such as ball in hand behind the head string, and cue-ball position goals.
 */
export type Placement = Point | CircleRegion | RectRegion;
/**
 * A placement region: an area a ball may be placed in, or that the cue ball should finish in. Discriminated by `shape` (ADR-0008).
 */
export type Region = CircleRegion | RectRegion;

/**
 * A pool drill: layout (where the balls are) and intention (what the player is trying to do). Experimental format 0.1 — the format stays deliberately unstable through 0.x and is only frozen at 1.0 (ADR-0001). This schema validates document *shape* only; meaning — exactly one cue ball, unique ball ids, resolvable ballId references, contiguous shot numbers, positions in bounds, non-overlap, min < max, target <= attempts, single_shot cardinality — is validated by validateDrill() in @pool-drill-gen/core. The schema is intentionally lenient: unknown properties are permitted everywhere, and a writer must preserve properties it did not understand (ADR-0006). Strictness is a CLI lint flag, not a format rule.
 */
export interface Drill {
  /**
   * Identifies this document family, so a reader can tell a drill from any other JSON it is handed.
   */
  format: 'pool-drill';
  /**
   * MAJOR.MINOR string, never a number (ADR-0001). 0.x offers no compatibility promise in either direction, so this schema pins the exact version; general version comparison belongs to the reader/migration layer, not here.
   */
  formatVersion: '0.1';
  /**
   * Opaque drill identifier. Implementations must not parse it or infer meaning from it. Hosted ids, share slugs, and share URLs never appear in a drill document (ADR-0007).
   */
  id: string;
  /**
   * Short human-readable name for the drill.
   */
  title: string;
  /**
   * Optional prose. Spin, speed, technique, and progressive/ladder progression rules live here in 0.1, because no structured model for them has been designed yet.
   */
  description?: string;
  authoredFor: AuthoredFor;
  /**
   * Optional game or discipline the drill is authored for, e.g. "8-ball", "9-ball", "straight-pool". Open-ended: the corpus has not fixed a closed vocabulary, and many drills are game-agnostic.
   */
  game?: string;
  /**
   * Every ball on the table for this drill, including obstacles. Exactly one must have role "cue" — a semantic rule, enforced in core.
   *
   * @minItems 1
   */
  balls: [Ball, ...Ball[]];
  /**
   * How the shots are to be attempted (ADR-0009). "strict": in order, and shots[].n is binding and contiguous from 1. "any_order": pot every ball in any order, and n is display numbering only. "single_shot": one shot — shots.length === 1 is a semantic rule enforced in core, not here.
   */
  sequencing: 'strict' | 'any_order' | 'single_shot';
  /**
   * The intention: what the player is trying to do. Shaped so that a sibling array — wagon-wheel variants, for instance — can be added additively later.
   *
   * @minItems 1
   */
  shots: [Shot, ...Shot[]];
  success: Success;
  /**
   * Optional open-ended tags for what the drill practices, e.g. "cut-shot", "position", "draw".
   */
  skills?: string[];
  /**
   * Optional author-assigned difficulty. Format 0.1 defines no scale, no bounds, and no direction: M0 never specified one, and picking one here would settle by accident a question the M2 corpus should answer. Presentation and filtering data only — nothing derives geometry or scoring from it.
   */
  difficulty?: number;
  /**
   * Optional free-form tags for organising and filtering drills.
   */
  tags?: string[];
  provenance: Provenance;
  /**
   * Declared home for application-specific data, so experimentation has a place that is unambiguously not part of the format. Carries the same preservation guarantee as the rest of the document (ADR-0006). Practice history never goes here — it lives in a separate local format (ADR-0007).
   */
  extensions?: {
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * The physical setup the drill was authored for. Required, because normalized coordinates alone cannot tell a reader whether a layout is physically possible: the ball does not scale with the table, so a layout that is legal on a 9-foot table can be impossible on a bar box (ADR-0005).
 */
export interface AuthoredFor {
  /**
   * Nominal label such as "7ft", "8ft", "8ft-oversize", "9ft". A convenience label and non-authoritative: where it disagrees with playingSurface the inch measurements win, and core warns on an implausible pairing. No implementation may derive geometry from this string (ADR-0005).
   */
  tableSize: string;
  /**
   * Authoritative playing-surface geometry, measured cushion nose to cushion nose — not rails, cabinet, slate, or the visible cloth edge (docs/coordinates.md §1). Dimensions are stored explicitly rather than derived from tableSize, and nothing assumes a 2:1 surface: the y bound is computed as widthIn / lengthIn.
   */
  playingSurface: {
    /**
     * Playing surface length L in inches, along the head-to-foot axis. Both coordinate axes are divided by L (ADR-0004).
     */
    lengthIn: number;
    /**
     * Playing surface width W in inches, across the table. y is bounded by W / L, never by a hardcoded 0.5.
     */
    widthIn: number;
    [k: string]: unknown;
  };
  /**
   * The balls the drill was authored with. Only diameter is modelled: weight, friction, and restitution would matter only to a physics simulation, which is out of scope (docs/coordinates.md §9).
   */
  ballSet: {
    /**
     * Ball diameter in inches, e.g. 2.25. The normalized radius is (ballDiameterIn / 2) / lengthIn, which core uses for bounds and non-overlap checks.
     */
    ballDiameterIn: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * One ball in the layout. Identity is the opaque `id`; `number` and `label` are presentation only, and no relationship in this format is keyed by ball number (ADR-0003).
 */
export interface Ball {
  /**
   * Opaque ball identifier, unique within this drill and referenced by shots[].ballId. Implementations must not parse it or infer meaning from it; human-readable values such as "cue", "b1", or "blocker-left" are encouraged precisely because they carry no semantics anything depends on (ADR-0003).
   */
  id: string;
  /**
   * "cue": the cue ball, exactly one per drill. "object": a ball intended to be struck or potted. "obstacle": a ball present only to block or constrain, never referenced by a shot. Format 0.1 defines no other role — in particular there is no "marker", because a role with no defined semantic would have its meaning settled by accident (ADR-0003).
   */
  role: 'cue' | 'object' | 'obstacle';
  at: Placement;
  /**
   * Optional ball number, for display. Never an identity key: a drill may contain placeholder balls with no number, several balls sharing a number, or balls from a set that has none.
   */
  number?: number;
  /**
   * Optional short label, for display — for balls better named than numbered.
   */
  label?: string;
  [k: string]: unknown;
}
/**
 * An exact position on the playing surface. Both axes are divided by the table length L, so x ∈ [0, 1] head end → foot end and y ∈ [0, W / L] left rail → right rail (ADR-0004, docs/coordinates.md §3). Left and right are fixed by standing behind the head end looking toward the foot end, and never depend on render orientation. Writers round to 4 decimal places; readers accept greater precision. Bounds — inset by one ball radius — depend on the drill's own playingSurface and are therefore checked in core, not here.
 */
export interface Point {
  /**
   * Position along the long axis: head end at 0, foot end at 1.
   */
  x: number;
  /**
   * Position across the short axis: left rail at 0, right rail at W / L.
   */
  y: number;
  [k: string]: unknown;
}
/**
 * A circular placement region.
 */
export interface CircleRegion {
  /**
   * Region discriminator. Regions use `shape` rather than `type`, because `type` is already the shot discriminator and one key must not mean two different things at two nesting depths (ADR-0008).
   */
  shape: 'circle';
  center: Point;
  /**
   * Radius in normalized units — the same scale as x and y, both divided by the table length.
   */
  radius: number;
  [k: string]: unknown;
}
/**
 * A rectangular placement region, given as corner points rather than origin-plus-size so there is no ambiguity about which corner is which. min < max on both axes is checked in core (ADR-0008).
 */
export interface RectRegion {
  /**
   * Region discriminator. See circleRegion.shape.
   */
  shape: 'rect';
  min: Point;
  max: Point;
  [k: string]: unknown;
}
/**
 * One shot in the drill. `type` is an explicit semantic discriminator, so no reader has to infer intent from which other fields happen to be present.
 */
export interface Shot {
  /**
   * Shot number. Under sequencing "strict" it is binding and must be contiguous from 1, which core enforces; under "any_order" it is display numbering only and does not constrain the order of attempts (ADR-0009).
   */
  n: number;
  /**
   * Shot semantics. Format 0.1 defines exactly one value: "pot" — pot the referenced ball in the named pocket. Whether bank, kick, and the rest belong in this field or elsewhere is a question for the M2 corpus, so nothing is pre-declared here.
   */
  type: 'pot';
  /**
   * The ball this shot is about, referencing balls[].id — never a ball number (ADR-0003). Reference resolution is checked in core.
   */
  ballId: string;
  /**
   * Target pocket, required when type is "pot". Identifiers are table-intrinsic and never encode a screen position — the word "top" appears nowhere in this format. Left and right are as seen standing behind the head end looking toward the foot end, so every render orientation is a transform over the same data (ADR-0002).
   */
  pocket?: 'head_left' | 'head_right' | 'side_left' | 'side_right' | 'foot_left' | 'foot_right';
  /**
   * Optional position goal: where the cue ball should finish after this shot. Always a region and never a single point, because nobody lands the cue ball on a coordinate (ADR-0008). Position goals are not scored in 0.1 — success counts pots (ADR-0009).
   */
  cueBallTarget?: Region;
  /**
   * Optional prose about this shot. Where spin, speed, and technique live in 0.1, until the corpus shows the right abstraction.
   */
  note?: string;
  [k: string]: unknown;
}
/**
 * What counts as passing the drill (ADR-0009). Both modes are meaningful under all three sequencing modes. Progressive/ladder scoring is deliberately absent from 0.1; a progression rule lives in `description` prose for now.
 */
export interface Success {
  /**
   * "run_all": complete the drill — every shot the sequencing calls for. "count": succeed `target` times out of `attempts` attempts.
   */
  mode: 'run_all' | 'count';
  /**
   * Number of attempts. Required when mode is "count".
   */
  attempts?: number;
  /**
   * Number of successful attempts needed. Required when mode is "count". target <= attempts is a cross-field rule and is checked in core.
   */
  target?: number;
  [k: string]: unknown;
}
/**
 * Where this drill came from (ADR-0007). An attribution record, not a link: nothing here is required to resolve.
 */
export interface Provenance {
  /**
   * Optional author or original source of the drill.
   */
  author?: string;
  /**
   * ISO 8601 UTC timestamp, e.g. "2026-08-28T14:00:00Z" (ADR-0007). The trailing Z is required: local times and numeric offsets are not accepted. This pattern checks layout and component ranges only — it rejects month 13 and hour 25, but it does NOT prove the date exists, so "2026-02-30T00:00:00Z" passes, and it does not accept leap seconds. Whether an impossible calendar date is worth a semantic check is a question for core, not a reason to add a date library here. The `format` keyword is avoided so the standalone validator needs no ajv-formats dependency.
   */
  createdAt: string;
  /**
   * Optional id of the drill this one was remixed from: a single parent pointer rather than a lineage graph, and a drill id rather than a URL. A remix always gets a new id, and practice statistics do not follow it (ADR-0007).
   */
  derivedFrom?: string;
  /**
   * Optional licence or usage terms. Present because many well-known drills originate in books or copyrighted material: a drill of uncertain origin should say so rather than leave this blank by default (ADR-0007).
   */
  license?: string;
  [k: string]: unknown;
}
