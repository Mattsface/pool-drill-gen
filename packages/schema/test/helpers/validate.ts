// Test-only wrapper around the package's public shape validator.
//
// These tests exercise the *precompiled* validator exported from
// @pool-drill-gen/schema. Nothing here calls ajv.compile(): the point of
// the suite is to prove the artifact that ships, not a freshly compiled
// copy of the schema.
import { expect } from 'vitest';
import { validateDrillSchema } from '../../src/index.js';

/**
 * The shape of an Ajv error object, narrowed to the parts these tests are
 * willing to depend on. Deliberately not the full `ErrorObject`: assertions
 * should survive harmless wording changes in Ajv.
 */
export interface SchemaError {
  keyword: string;
  instancePath: string;
  schemaPath: string;
  params: Record<string, unknown>;
  message?: string;
}

// The generated validator is JavaScript, so its emitted declaration says
// only "(data) => boolean" and does not describe the `errors` property Ajv
// attaches. This cast is confined to the test helper.
type ValidatorWithErrors = ((data: unknown) => boolean) & {
  errors?: SchemaError[] | null;
};

const validator = validateDrillSchema as unknown as ValidatorWithErrors;

export interface ValidationResult {
  valid: boolean;
  errors: SchemaError[];
}

/** Runs the shape validator and snapshots the errors it attached. */
export function validate(document: unknown): ValidationResult {
  const valid = validator(document);
  return { valid, errors: valid ? [] : (validator.errors ?? []) };
}

/** A compact, readable rendering of errors, for assertion failure output. */
function summarize(errors: SchemaError[]): string[] {
  return errors.map((e) => `${e.instancePath || '<root>'}: ${e.keyword}`);
}

/**
 * Asserts the document is shape-valid. On failure the assertion message
 * lists the offending keywords and paths rather than a bare `false`.
 */
export function expectValid(document: unknown): void {
  const { valid, errors } = validate(document);
  expect(summarize(errors)).toEqual([]);
  expect(valid).toBe(true);
}

/**
 * Asserts the document is rejected, and that the validator actually exposed
 * errors for it. Returns the errors so a test can make a more specific
 * claim about keyword / instancePath / schemaPath where that adds value.
 */
export function expectInvalid(document: unknown): SchemaError[] {
  const { valid, errors } = validate(document);
  expect(valid).toBe(false);
  expect(errors.length).toBeGreaterThan(0);
  return errors;
}

export interface ErrorMatcher {
  keyword?: string;
  instancePath?: string;
  /** Substring match — full schemaPath strings are brittle. */
  schemaPathContains?: string;
  /** Matches Ajv's `params.missingProperty`. */
  missingProperty?: string;
}

function matches(error: SchemaError, matcher: ErrorMatcher): boolean {
  if (matcher.keyword !== undefined && error.keyword !== matcher.keyword) return false;
  if (matcher.instancePath !== undefined && error.instancePath !== matcher.instancePath) {
    return false;
  }
  if (
    matcher.schemaPathContains !== undefined &&
    !error.schemaPath.includes(matcher.schemaPathContains)
  ) {
    return false;
  }
  if (
    matcher.missingProperty !== undefined &&
    error.params?.missingProperty !== matcher.missingProperty
  ) {
    return false;
  }
  return true;
}

/** Asserts at least one reported error matches every field of the matcher. */
export function expectErrorMatching(errors: SchemaError[], matcher: ErrorMatcher): void {
  const found = errors.some((error) => matches(error, matcher));
  expect(
    found,
    `no error matched ${JSON.stringify(matcher)}; got ${JSON.stringify(summarize(errors))}`,
  ).toBe(true);
}
