// Public exports for @pool-drill-gen/schema.
//
// Everything here is derived from the canonical JSON Schema in
// src/schema/. Types come from json-schema-to-typescript and the
// validator is precompiled at generation time — application code never
// calls ajv.compile(), it only imports the generated validator module.
//
// NOTE: the schema, types, and validator below are a TEMPORARY
// placeholder for the M1.2 schema tooling pipeline (issue #3), living at
// the permanent canonical drill-schema paths. The drill format 0.1 model
// lands in M1.3 (issue #4).
export type { DrillPlaceholder } from './generated/drill.js';
export { default as validateDrillSchema } from './generated/drill.validator.js';
