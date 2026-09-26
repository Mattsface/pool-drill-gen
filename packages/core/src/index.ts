// Public exports for @pool-drill-gen/core.
//
// Platform-neutral by rule: no fs, no process, no node:* imports, no DOM,
// and no platform SDKs anywhere in this package. File I/O lives in
// apps/cli. Everything here must run unchanged in Node, a browser, and a
// Cloudflare Worker.
export { validateDrill, VALIDATION_CODES } from './validation.js';
export type {
  ValidateDrillOptions,
  ValidationCode,
  ValidationIssue,
  ValidationResult,
} from './validation.js';

// Geometry primitives (M1.7, issue #8): the coordinate mathematics of
// docs/coordinates.md as plain functions. Arithmetic only — the geometry
// *rules* that consume these (M1.8) run inside validateDrill().
export { surfaceRatio, ballRadius, distance, fromDiamonds, toDiamonds } from './geometry.js';
export type { PlayingSurface, BallSet, DiamondPoint, TableGeometry } from './geometry.js';

// Serialization (M1.10, issue #11): the writer for ADR-0006's lossless
// round-trip. A drill is the parsed JSON object, so unknown properties are
// carried by the representation rather than copied by the writer.
export { serializeDrill } from './serialization.js';
