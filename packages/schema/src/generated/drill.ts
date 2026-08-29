/* eslint-disable */
/**
 * AUTO-GENERATED — do not edit by hand.
 * Generated from src/schema/drill.schema.json by `pnpm schema:types`.
 */

/**
 * Either an exact point or a region (ADR-0008). A placement without `shape` is a point.
 */
export type Placement = Point | CircleRegion | RectRegion;

/**
 * A pool drill: layout (where the balls are) and intention (what the player is trying to do). Experimental format 0.1 — see docs/adr/0001-format-lifecycle-and-versioning.md. This schema is intentionally lenient: unknown properties are permitted everywhere so additive future versions round-trip through this reader (docs/adr/0006-compatibility-and-unknown-fields.md).
 */
export interface Drill {
  /**
   * Canonical format identifier for this document family.
   */
  format: 'pool-drill';
  /**
   * MAJOR.MINOR string. 0.x offers no compatibility promise; readers pin an exact version (ADR-0001).
   */
  formatVersion: '0.1';
  /**
   * Opaque drill identifier. Implementations must not parse it or infer meaning from it.
   */
  id: string;
  title: string;
  description?: string;
  authoredFor: {
    /**
     * Nominal label (e.g. "9ft"). Non-authoritative: playingSurface is the authoritative geometry (ADR-0005).
     */
    tableSize: string;
    playingSurface: {
      /**
       * Playing surface length L, cushion nose to cushion nose, in inches.
       */
      lengthIn: number;
      /**
       * Playing surface width W, cushion nose to cushion nose, in inches.
       */
      widthIn: number;
      [k: string]: unknown;
    };
    ballSet: {
      ballDiameterIn: number;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  /**
   * The game or discipline this drill is authored for (e.g. "8-ball", "9-ball", "straight-pool"). Open-ended: the drill corpus has not yet fixed a closed vocabulary.
   */
  game: string;
  /**
   * @minItems 1
   */
  balls: [Ball, ...Ball[]];
  sequencing: 'single_shot' | 'strict' | 'any_order';
  /**
   * @minItems 1
   */
  shots: [Shot, ...Shot[]];
  success: Success;
  /**
   * Open-ended skill tags this drill practices (e.g. "cut-shot", "position").
   */
  skills: string[];
  difficulty: number;
  tags: string[];
  provenance: Provenance;
  /**
   * Declared home for application-specific data. Intentionally open-ended; carries the same unknown-field preservation guarantee as the rest of the document (ADR-0006).
   */
  extensions: {
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
export interface Ball {
  /**
   * Opaque drill-local ball identifier. Never key anything by ball number (ADR-0003).
   */
  id: string;
  role: 'cue' | 'object' | 'obstacle';
  at: Placement;
  /**
   * Optional presentation data. Never an identity key.
   */
  number?: number;
  /**
   * Optional presentation data.
   */
  label?: string;
  [k: string]: unknown;
}
export interface Point {
  x: number;
  y: number;
  [k: string]: unknown;
}
export interface CircleRegion {
  shape: 'circle';
  center: Point;
  radius: number;
  [k: string]: unknown;
}
export interface RectRegion {
  shape: 'rect';
  min: Point;
  max: Point;
  [k: string]: unknown;
}
export interface Shot {
  n: number;
  /**
   * Format 0.1 defines exactly one shot type.
   */
  type: 'pot';
  /**
   * References balls[].id. Resolution is a core-level concern.
   */
  ballId: string;
  pocket?: 'head_left' | 'head_right' | 'side_left' | 'side_right' | 'foot_left' | 'foot_right';
  /**
   * Position goal for the cue ball after this shot. Always a Region, never a single point (ADR-0008).
   */
  cueBallTarget?: CircleRegion | RectRegion;
  note?: string;
  [k: string]: unknown;
}
export interface Success {
  mode: 'run_all' | 'count';
  attempts?: number;
  target?: number;
  [k: string]: unknown;
}
export interface Provenance {
  author?: string;
  /**
   * ISO 8601 UTC timestamp (ADR-0007). A pattern is used instead of the `format` keyword so the standalone Ajv validator stays precompiled without an ajv-formats runtime dependency.
   */
  createdAt: string;
  /**
   * Opaque id of the parent drill this was remixed from. A single parent pointer, not a graph (ADR-0007).
   */
  derivedFrom?: string;
  license?: string;
  [k: string]: unknown;
}
