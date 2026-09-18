// ADR-0006: the published schema is lenient. Unknown properties are
// permitted everywhere, because `additionalProperties: false` would make
// every additive change break every older reader — the opposite of what a
// MINOR bump is supposed to mean.
//
// These tests exist specifically to prevent an accidental tightening of the
// schema later. If one of them starts failing, that is a breaking format
// change and needs an ADR, not a fix to the test.
//
// Between them they cover every object the schema defines — the drill root,
// authoredFor, playingSurface, ballSet, ball, point, circle region, rect
// region, shot, cueBallTarget, success, provenance and extensions — so an
// `additionalProperties: false` added anywhere fails at least one case.
import { describe, it } from 'vitest';
import { expectValid } from './helpers/validate.js';
import { drillWith, representativeDrill, withObjectBall, withShot } from './helpers/drills.js';

const UNKNOWN = { futureField: 'from a later minor version' };

describe('unknown properties are accepted (ADR-0006)', () => {
  it('at the drill root', () => {
    expectValid(drillWith(UNKNOWN));
    expectValid(drillWith({ variants: [{ cueBall: { x: 0.2, y: 0.2 } }] }));
  });

  it('inside authoredFor and its nested objects', () => {
    expectValid(
      drillWith({
        authoredFor: {
          tableSize: '9ft',
          playingSurface: { lengthIn: 100, widthIn: 50, pocketSizeIn: 4.5 },
          ballSet: { ballDiameterIn: 2.25, brand: 'Aramith' },
          ...UNKNOWN,
        },
      }),
    );
  });

  it('inside a ball', () => {
    expectValid(withObjectBall(UNKNOWN));
  });

  it('inside a point placement', () => {
    expectValid(withObjectBall({ at: { x: 0.75, y: 0.25, ...UNKNOWN } }));
  });

  it('inside a circle region', () => {
    expectValid(
      withObjectBall({
        at: { shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: 0.05, ...UNKNOWN },
      }),
    );
  });

  it('inside a rect region', () => {
    expectValid(
      withObjectBall({
        at: {
          shape: 'rect',
          min: { x: 0.1, y: 0.1, ...UNKNOWN },
          max: { x: 0.4, y: 0.4 },
          ...UNKNOWN,
        },
      }),
    );
  });

  it('inside a shot', () => {
    expectValid(withShot({ ...UNKNOWN, spin: { english: 'left', vertical: 'draw' } }));
  });

  it('inside a cue-ball target region', () => {
    expectValid(
      withShot({
        cueBallTarget: {
          shape: 'circle',
          center: { x: 0.4, y: 0.25 },
          radius: 0.07,
          ...UNKNOWN,
        },
      }),
    );
  });

  it('inside success', () => {
    expectValid(drillWith({ success: { mode: 'run_all', ...UNKNOWN } }));
    expectValid(
      drillWith({
        success: { mode: 'count', attempts: 10, target: 7, progression: 'ladder' },
      }),
    );
  });

  it('inside provenance', () => {
    expectValid(drillWith({ provenance: { createdAt: '2026-08-28T14:00:00Z', ...UNKNOWN } }));
  });

  it('inside extensions, which is free-form by design', () => {
    expectValid(
      drillWith({ extensions: { 'com.example.app': { nested: { deeply: [1, { a: 2 }] } } } }),
    );
  });

  it('all at once, so nothing depends on only one unknown field being present', () => {
    const doc = representativeDrill() as unknown as Record<string, unknown>;
    doc.futureTopLevel = 'x';
    (doc.authoredFor as Record<string, unknown>).futureSetup = 'x';
    (doc.balls as Record<string, unknown>[])[0].futureBall = 'x';
    ((doc.balls as Record<string, unknown>[])[0].at as Record<string, unknown>).futurePoint = 'x';
    (doc.shots as Record<string, unknown>[])[0].futureShot = 'x';
    (doc.success as Record<string, unknown>).futureSuccess = 'x';
    (doc.provenance as Record<string, unknown>).futureProvenance = 'x';
    expectValid(doc);
  });

  it('a point with an unknown property is still discriminated as a point', () => {
    // Leniency must not disturb the `shape` discriminator: an unknown
    // property is not a shape, so the placement still matches exactly one
    // branch of the oneOf.
    expectValid(withObjectBall({ at: { x: 0.75, y: 0.25, kind: 'circle' } }));
  });
});
