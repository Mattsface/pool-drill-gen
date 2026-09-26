// ADR-0006 rule 2: round-trips are lossless. A tool that reads a drill and
// writes it back preserves the properties it does not understand, in place.
//
// The fixture is a valid 0.1 drill carrying unknown properties at the root,
// inside a ball, inside a region nested in a shot, inside playingSurface,
// and in `extensions`. Every test reads it with JSON.parse, narrows it with
// the public schema validator, and writes it with serializeDrill().
// Comparisons are on parsed JSON values — equivalence modulo formatting —
// never on text.
import { describe, expect, it } from 'vitest';
import { validateDrillSchema, type Drill } from '@pool-drill-gen/schema';
import { serializeDrill, validateDrill } from '../src/index.js';
import source from './round-trip/unknown-fields.pooldrill.json?raw';

/** The fixture as a fresh JSON value, independent of any other test's edits. */
function original(): Record<string, unknown> {
  return JSON.parse(source) as Record<string, unknown>;
}

/** Read step: parse, check shape, and only then treat the value as a Drill. */
function read(text: string): Drill {
  const document: unknown = JSON.parse(text);
  if (!validateDrillSchema(document)) {
    const errors = (validateDrillSchema as typeof validateDrillSchema & { errors?: unknown }).errors;
    throw new Error(`Schema errors: ${JSON.stringify(errors)}`);
  }
  return document as Drill;
}

/** The unknown properties in the fixture, by location, with their exact values. */
function unknownFieldsOf(document: any) {
  return {
    root: document.futureRootField,
    playingSurface: document.authoredFor.playingSurface.futureClothField,
    ball: document.balls[0].futureBallField,
    region: document.shots[0].cueBallTarget.futureRegionField,
    extensions: document.extensions,
  };
}

const EXPECTED_UNKNOWN_FIELDS = {
  root: { enabled: true, levels: [1, 2, 3] },
  playingSurface: 'tournament-blue',
  ball: 'preserve-me',
  region: { tolerance: null, hints: ['near', 'stop'] },
  extensions: { 'com.example.trainer': { lastOpenedTab: 'layout' } },
};

describe('round-trip preservation of unknown properties (ADR-0006)', () => {
  it('the fixture carries unknown properties and passes both public validators', () => {
    expect(unknownFieldsOf(original())).toEqual(EXPECTED_UNKNOWN_FIELDS);

    const drill = read(source);
    const result = validateDrill(drill);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('read → write is deeply equal to the original, key order included', () => {
    const written = JSON.parse(serializeDrill(read(source)));

    expect(written).toEqual(original());
    // toEqual ignores key order; "in place" also means the same order.
    expect(JSON.stringify(written)).toBe(JSON.stringify(original()));
  });

  it('read → edit title → write changes only the title', () => {
    const drill = read(source);
    drill.title = 'Edited title';

    const written = JSON.parse(serializeDrill(drill));

    expect(written.title).toBe('Edited title');
    expect(written).toEqual({ ...original(), title: 'Edited title' });
    expect(unknownFieldsOf(written)).toEqual(EXPECTED_UNKNOWN_FIELDS);
    expect(Object.keys(written)).toEqual(Object.keys(original()));
  });

  it('editing a known field beside nested unknown data keeps that data at the same path', () => {
    const drill = read(source);
    drill.shots[0].note = 'Edited note';

    const written = JSON.parse(serializeDrill(drill));

    const expected = original() as any;
    expected.shots[0].note = 'Edited note';
    expect(written).toEqual(expected);
    expect(written.shots[0].cueBallTarget.futureRegionField).toEqual(
      EXPECTED_UNKNOWN_FIELDS.region,
    );
    expect(written.balls[0].futureBallField).toBe(EXPECTED_UNKNOWN_FIELDS.ball);
    // Coordinates are written as held, not rewritten because the document
    // passed through a writer.
    expect(written.balls[1].at).toEqual({ x: 0.7123, y: 0.1457 });
  });

  it('an edited document still passes both public validators', () => {
    const drill = read(source);
    drill.title = 'Edited title';
    drill.shots[0].note = 'Edited note';

    const reread = read(serializeDrill(drill));
    expect(validateDrill(reread).issues).toEqual([]);
  });

  it('serializeDrill does not mutate its argument', () => {
    const drill = read(source);
    const before: unknown = JSON.parse(JSON.stringify(drill));

    serializeDrill(drill);

    expect(drill).toEqual(before);
  });
});
