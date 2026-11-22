// migrate() is the identity function for formatVersion "0.1" and a
// structured failure for everything else (ADR-0001, issue #16).
import { describe, expect, it } from 'vitest';
import { validateDrillSchema, type Drill } from '@pool-drill-gen/schema';
import {
  migrate,
  MIGRATION_CODES,
  SUPPORTED_FORMAT_VERSION,
  validateDrill,
  type MigrationCode,
  type MigrationIssue,
  type MigrationResult,
} from '../src/index.js';
import roundTripSource from './round-trip/unknown-fields.pooldrill.json?raw';
import fixtureSource from './fixtures/stop-shot-repetition.pooldrill.json?raw';

function parse(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Asserts a single-issue failure and returns that issue. */
function failureOf(result: MigrationResult): MigrationIssue {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a failure');
  expect(result.issues).toHaveLength(1);
  return result.issues[0];
}

function withVersion(version: unknown): Record<string, unknown> {
  return { ...parse(fixtureSource), formatVersion: version };
}

describe('migrate() on a supported 0.1 document', () => {
  it('pins exactly "0.1"', () => {
    expect(SUPPORTED_FORMAT_VERSION).toBe('0.1');
  });

  it('succeeds on a valid 0.1 drill and returns the same object reference', () => {
    const document = parse(fixtureSource);
    const result = migrate(document);

    expect(result).toEqual({ ok: true, document });
    if (!result.ok) throw new Error('expected success');
    expect(result.document).toBe(document);
  });

  it('accepts a typed Drill and returns it still typed as a Drill', () => {
    const drill = parse(fixtureSource) as unknown as Drill;
    const result = migrate(drill);
    if (!result.ok) throw new Error('expected success');
    const typed: Drill = result.document;
    expect(typed).toBe(drill);
  });

  it('preserves unknown root, nested, and extension properties', () => {
    const document = parse(roundTripSource) as any;
    const result = migrate(document);
    if (!result.ok) throw new Error('expected success');

    const migrated = result.document as any;
    expect(migrated).toEqual(parse(roundTripSource));
    expect(migrated.futureRootField).toEqual({ enabled: true, levels: [1, 2, 3] });
    expect(migrated.authoredFor.playingSurface.futureClothField).toBe('tournament-blue');
    expect(migrated.balls[0].futureBallField).toBe('preserve-me');
    expect(migrated.shots[0].cueBallTarget.futureRegionField).toEqual({
      tolerance: null,
      hints: ['near', 'stop'],
    });
    expect(migrated.extensions).toEqual({ 'com.example.trainer': { lastOpenedTab: 'layout' } });
  });

  it('read → migrate → write of the M1.10 fixture is lossless', () => {
    const document: unknown = JSON.parse(roundTripSource);
    expect(validateDrillSchema(document)).toBe(true);

    const result = migrate(document);
    if (!result.ok) throw new Error('expected success');

    const written = JSON.parse(JSON.stringify(result.document, null, 2));
    expect(written).toEqual(parse(roundTripSource));
    expect(validateDrill(result.document as Drill).issues).toEqual([]);
  });

  it('does not mutate its input, even a deep-frozen one', () => {
    const document = deepFreeze(parse(roundTripSource));
    const snapshot = JSON.parse(JSON.stringify(document));

    const result = migrate(document);

    expect(result.ok).toBe(true);
    expect(document).toEqual(snapshot);
  });

  it('is idempotent: migrating the result again yields the same result', () => {
    const document = parse(roundTripSource);
    const first = migrate(document);
    if (!first.ok) throw new Error('expected success');
    const second = migrate(first.document);

    expect(second).toEqual(first);
    if (!second.ok) throw new Error('expected success');
    expect(second.document).toBe(document);
  });

  it('checks the version only, not shape or meaning', () => {
    // Not a drill by any other measure, yet the version is the one this build reads.
    const document = { formatVersion: '0.1', balls: 'not an array' };
    const result = migrate(document);
    expect(result.ok).toBe(true);
    expect(validateDrillSchema(document)).toBe(false);
  });
});

describe('migrate() on unsupported versions', () => {
  it.each(['0.0', '0.2', '0.9', '0.10', '0.11', '1.0', '1.1', '2.0', '10.1'])(
    'rejects well-formed "%s" as FORMAT_VERSION_UNSUPPORTED',
    (version) => {
      const issue = failureOf(migrate(withVersion(version)));
      expect(issue.code).toBe('FORMAT_VERSION_UNSUPPORTED');
      expect(issue.paths).toEqual(['formatVersion']);
      expect(issue.message).toContain(`"${version}"`);
      expect(issue.message).toContain('"0.1"');
    },
  );

  it('distinguishes "0.1" from "0.10" — versions are strings, not numbers', () => {
    expect(migrate(withVersion('0.1')).ok).toBe(true);
    expect(failureOf(migrate(withVersion('0.10'))).code).toBe('FORMAT_VERSION_UNSUPPORTED');
  });

  it.each([
    ['the number 0.1', 0.1],
    ['the number 1', 1],
    ['null', null],
    ['a boolean', true],
    ['an object', { major: 0, minor: 1 }],
    ['an array', ['0', '1']],
  ])('rejects %s as FORMAT_VERSION_INVALID', (_label, version) => {
    const issue = failureOf(migrate(withVersion(version)));
    expect(issue.code).toBe('FORMAT_VERSION_INVALID');
    expect(issue.paths).toEqual(['formatVersion']);
  });

  it.each(['', '0', '0.1.0', 'v0.1', ' 0.1', '0.1 ', '00.1', '0.01', '0.x', '.1', '0.'])(
    'rejects malformed string %j as FORMAT_VERSION_INVALID',
    (version) => {
      const issue = failureOf(migrate(withVersion(version)));
      expect(issue.code).toBe('FORMAT_VERSION_INVALID');
      expect(issue.paths).toEqual(['formatVersion']);
    },
  );

  it('rejects a missing formatVersion as FORMAT_VERSION_MISSING', () => {
    const document = parse(fixtureSource);
    delete document.formatVersion;
    const issue = failureOf(migrate(document));
    expect(issue.code).toBe('FORMAT_VERSION_MISSING');
    expect(issue.paths).toEqual(['formatVersion']);
  });

  it('does not read formatVersion from the prototype chain', () => {
    const document = Object.create({ formatVersion: '0.1' }) as object;
    expect(failureOf(migrate(document)).code).toBe('FORMAT_VERSION_MISSING');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', [{ formatVersion: '0.1' }]],
    ['a string', '0.1'],
    ['a number', 0.1],
    ['a boolean', false],
  ])('rejects %s as DOCUMENT_NOT_OBJECT without throwing', (_label, input) => {
    let result: MigrationResult | undefined;
    expect(() => {
      result = migrate(input);
    }).not.toThrow();
    const issue = failureOf(result!);
    expect(issue.code).toBe('DOCUMENT_NOT_OBJECT');
    expect(issue.paths).toEqual([]);
  });

  it('does not mutate a rejected input', () => {
    const document = deepFreeze(withVersion('0.2'));
    const snapshot = JSON.parse(JSON.stringify(document));
    expect(migrate(document).ok).toBe(false);
    expect(document).toEqual(snapshot);
  });

  it('reports only codes from MIGRATION_CODES', () => {
    const inputs: unknown[] = [null, {}, withVersion(1), withVersion('0.2')];
    const codes = inputs.map((input) => failureOf(migrate(input)).code);
    expect(codes).toEqual([
      'DOCUMENT_NOT_OBJECT',
      'FORMAT_VERSION_MISSING',
      'FORMAT_VERSION_INVALID',
      'FORMAT_VERSION_UNSUPPORTED',
    ] satisfies MigrationCode[]);
    expect([...MIGRATION_CODES].sort()).toEqual([...codes].sort());
  });
});
