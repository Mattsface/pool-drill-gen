// Public exports for @pool-drill-gen/schema.
//
// Everything here is derived from the canonical JSON Schema in
// src/schema/. Types come from json-schema-to-typescript and the
// validator is precompiled at generation time — application code never
// calls ajv.compile(), it only imports the generated validator module.
//
// This package validates document *shape* only: required fields, enums,
// types, and conditional requirements. Semantic validation — exactly one
// cue ball, unique ball ids, resolvable ballId references, geometry
// bounds, non-overlap — lives in validateDrill() in
// @pool-drill-gen/core.
export type {
  Drill,
  AuthoredFor,
  Ball,
  Shot,
  Success,
  Provenance,
  Placement,
  Region,
  CircleRegion,
  RectRegion,
  Point,
} from './generated/drill.js';
export { default as validateDrillSchema } from './generated/drill.validator.js';

// The canonical JSON Schema itself, as data. Exposed so tooling can read
// the schema's declared structure — `pooldrill validate --strict` derives
// its known-property set from it — rather than restating it by hand.
// Never pass this to ajv.compile(); validation uses the precompiled module.
export { default as drillSchema } from './schema/drill.schema.json' with { type: 'json' };
