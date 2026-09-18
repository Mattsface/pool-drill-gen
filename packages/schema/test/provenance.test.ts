// Provenance timestamps (ADR-0007).
//
// `createdAt` is an ISO 8601 UTC timestamp and the trailing Z is required:
// local times and numeric offsets are not accepted. The schema uses a
// `pattern` rather than the `format` keyword so the standalone validator
// needs no ajv-formats dependency, which means the check is layout and
// component ranges only — see schema-vs-semantic.test.ts for what that
// deliberately lets through.
import { describe, it } from 'vitest';
import { expectErrorMatching, expectInvalid, expectValid } from './helpers/validate.js';
import { drillWith } from './helpers/drills.js';

const createdAt = (value: unknown) => drillWith({ provenance: { createdAt: value } });

describe('provenance.createdAt', () => {
  it.each([
    '2026-08-28T14:00:00Z',
    '2026-08-28T14:00:00.123Z',
    '2026-08-28T14:00:00.000000Z',
    '2026-12-31T23:59:59Z',
    '2026-01-01T00:00:00Z',
  ])('accepts the UTC timestamp %s', (value) => {
    expectValid(createdAt(value));
  });

  it.each([
    ['no trailing Z', '2026-08-28T14:00:00'],
    ['a numeric UTC offset', '2026-08-28T14:00:00+00:00'],
    ['a non-UTC offset', '2026-08-28T14:00:00-05:00'],
    ['a date with no time', '2026-08-28'],
    ['a space instead of T', '2026-08-28 14:00:00Z'],
    ['lowercase designators', '2026-08-28t14:00:00z'],
    ['month 13', '2026-13-01T00:00:00Z'],
    ['day 32', '2026-08-32T00:00:00Z'],
    ['hour 25', '2026-08-28T25:00:00Z'],
    ['minute 60', '2026-08-28T14:60:00Z'],
    ['a leap second', '2026-06-30T23:59:60Z'],
    ['a two-digit year', '26-08-28T14:00:00Z'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expectErrorMatching(expectInvalid(createdAt(value)), {
      keyword: 'pattern',
      instancePath: '/provenance/createdAt',
    });
  });

  it('rejects an epoch number', () => {
    expectErrorMatching(expectInvalid(createdAt(1787061600)), {
      keyword: 'type',
      instancePath: '/provenance/createdAt',
    });
  });

  it('rejects a non-object provenance', () => {
    expectErrorMatching(expectInvalid(drillWith({ provenance: '2026-08-28T14:00:00Z' })), {
      keyword: 'type',
      instancePath: '/provenance',
    });
  });
});
