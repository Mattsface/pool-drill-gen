// The format migration entry point (ADR-0001, issue #16).
//
// migrate() exists from M1 so that the migration path is architectural
// rather than bolted on later. Format 0.1 is the only version there is,
// so for now it is the identity function: a supported document comes back
// as the very same object, untouched — nothing is rebuilt, normalized, or
// serialized, which is what keeps ADR-0006's lossless round-trip intact.
//
// Its one real job today is the reader rule for 0.x: pin the exact
// formatVersion string and reject everything else. 0.x offers no
// compatibility promise in either direction, so "0.0", "0.2", and "1.0"
// are all refused alike. Versions are compared as strings, never as
// numbers — "0.10" is not "0.1". The tolerant same-major rules for ≥ 1.0
// are deliberately not implemented; there is no 1.0 yet.
//
// migrate() checks formatVersion and nothing else. Success says only that
// this build reads the document's version — not that the document passes
// the schema or validateDrill().

/** The one formatVersion this build reads. 0.x readers pin it exactly (ADR-0001). */
export const SUPPORTED_FORMAT_VERSION = '0.1';

/**
 * The failures migrate() can report. Same conventions as VALIDATION_CODES:
 * codes are stable and machine-readable, messages are for people.
 */
export const MIGRATION_CODES = [
  // The input is not a JSON object — null, an array, or a primitive — so it
  // cannot carry a formatVersion at all.
  'DOCUMENT_NOT_OBJECT',
  // The document has no own `formatVersion` property.
  'FORMAT_VERSION_MISSING',
  // `formatVersion` is present but is not a "MAJOR.MINOR" string: a number,
  // null, "0.1.0", "v0.1", and so on.
  'FORMAT_VERSION_INVALID',
  // `formatVersion` is well-formed but is not a version this build reads.
  'FORMAT_VERSION_UNSUPPORTED',
] as const;

/** A migration failure code. Derived from MIGRATION_CODES so the two can never drift. */
export type MigrationCode = (typeof MIGRATION_CODES)[number];

/**
 * One migration failure. Shaped like ValidationIssue: a code to switch on,
 * accessor paths into the document, and a message for people.
 */
export interface MigrationIssue {
  code: MigrationCode;
  /** `["formatVersion"]`, or empty when the input is not an object at all. */
  paths: string[];
  /** Human-readable explanation. Presentation only — never parse it. */
  message: string;
}

/**
 * The outcome of {@link migrate}. An unsupported document is an ordinary
 * failure result, never an exception.
 */
export type MigrationResult<T = unknown> =
  | {
      ok: true;
      /** The input itself — the same object reference, unchanged. */
      document: T;
    }
  | {
      ok: false;
      /** Why the document cannot be migrated. Never empty. */
      issues: MigrationIssue[];
    };

const FORMAT_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

/**
 * Brings a document up to the format version this build reads.
 *
 * Accepts any value — a freshly parsed `unknown` as readily as a typed
 * Drill — so that an unsupported version reaches the version check
 * without the caller first casting it to a type it does not satisfy.
 */
export function migrate<T>(document: T): MigrationResult<T> {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    return failure('DOCUMENT_NOT_OBJECT', [], 'A drill document must be a JSON object.');
  }

  if (!Object.prototype.hasOwnProperty.call(document, 'formatVersion')) {
    return failure(
      'FORMAT_VERSION_MISSING',
      ['formatVersion'],
      `The document has no formatVersion; this build reads "${SUPPORTED_FORMAT_VERSION}".`,
    );
  }

  const version: unknown = (document as unknown as { formatVersion: unknown }).formatVersion;

  if (typeof version !== 'string' || !FORMAT_VERSION_PATTERN.test(version)) {
    return failure(
      'FORMAT_VERSION_INVALID',
      ['formatVersion'],
      `formatVersion must be a "MAJOR.MINOR" string such as "${SUPPORTED_FORMAT_VERSION}"; got ${describe(version)}.`,
    );
  }

  if (version !== SUPPORTED_FORMAT_VERSION) {
    return failure(
      'FORMAT_VERSION_UNSUPPORTED',
      ['formatVersion'],
      `formatVersion "${version}" is not supported; this build reads exactly "${SUPPORTED_FORMAT_VERSION}". ` +
        'Format 0.x offers no compatibility promise in either direction (ADR-0001).',
    );
  }

  // 0.1 is the current version: nothing to migrate.
  return { ok: true, document };
}

function failure(code: MigrationCode, paths: string[], message: string): MigrationResult<never> {
  return { ok: false, issues: [{ code, paths, message }] };
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}
