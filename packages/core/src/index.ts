// Public exports for @pool-drill-gen/core.
//
// Platform-neutral by rule: no fs, no process, no node:* imports, no DOM,
// and no platform SDKs anywhere in this package. File I/O lives in
// apps/cli. Everything here must run unchanged in Node, a browser, and a
// Cloudflare Worker.
export { validateDrill, VALIDATION_CODES } from './validation.js';
export type { ValidationCode, ValidationIssue, ValidationResult } from './validation.js';
