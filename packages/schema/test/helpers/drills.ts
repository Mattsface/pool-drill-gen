// Test-only drill factories.
//
// Deliberately NOT a fixture corpus and NOT a production API: the real
// fixture drills are later M1 work, and nothing outside this test suite
// should import these. The point of a factory here is that a negative test
// can mutate exactly one field of a known-good document instead of
// restating a whole drill.
import type { Drill } from '../../src/index.js';

export type JsonObject = Record<string, unknown>;

export const CUE_BALL_ID = 'cue';
export const OBJECT_BALL_ID = 'b1';

/** Index of the object ball in the factory documents, for instancePath assertions. */
export const OBJECT_BALL_INDEX = 1;

// Test documents are plain JSON by construction, so a JSON round-trip is
// both a correct deep clone and free of any platform dependency.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The smallest document the schema accepts: required fields only, no
 * optional metadata anywhere. Every field present here is present because
 * removing it makes the document invalid — that is what the test suite
 * asserts, so this factory doubles as documentation of what 0.1 requires.
 */
export function minimalDrill(): Drill {
  return {
    format: 'pool-drill',
    formatVersion: '0.1',
    id: 'minimal-drill',
    title: 'Minimal drill',
    authoredFor: {
      tableSize: '9ft',
      playingSurface: { lengthIn: 100, widthIn: 50 },
      ballSet: { ballDiameterIn: 2.25 },
    },
    balls: [
      { id: CUE_BALL_ID, role: 'cue', at: { x: 0.25, y: 0.25 } },
      { id: OBJECT_BALL_ID, role: 'object', at: { x: 0.75, y: 0.25 } },
    ],
    sequencing: 'single_shot',
    shots: [{ n: 1, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_right' }],
    success: { mode: 'run_all' },
    provenance: { createdAt: '2026-08-28T14:00:00Z' },
  };
}

/**
 * A fuller document: optional metadata at every level, all three placement
 * forms (point, circle region, rect region), both region forms as cue-ball
 * position goals, and `count` success.
 */
export function representativeDrill(): Drill {
  return {
    format: 'pool-drill',
    formatVersion: '0.1',
    id: 'representative-drill',
    title: 'Representative drill',
    description: 'Soft draw off the first ball; the progression rule lives in prose in 0.1.',
    authoredFor: {
      tableSize: '7ft',
      playingSurface: { lengthIn: 78, widthIn: 39 },
      ballSet: { ballDiameterIn: 2.25 },
    },
    game: '9-ball',
    balls: [
      // Point placement.
      { id: CUE_BALL_ID, role: 'cue', at: { x: 0.2, y: 0.25 }, label: 'cue' },
      // Circle-region placement.
      {
        id: OBJECT_BALL_ID,
        role: 'object',
        at: { shape: 'circle', center: { x: 0.62, y: 0.18 }, radius: 0.04 },
        number: 1,
      },
      // Rect-region placement.
      {
        id: 'b2',
        role: 'object',
        at: { shape: 'rect', min: { x: 0.7, y: 0.3 }, max: { x: 0.85, y: 0.42 } },
        number: 2,
        label: 'two',
      },
      { id: 'blocker-left', role: 'obstacle', at: { x: 0.5, y: 0.12 }, number: 8 },
    ],
    sequencing: 'strict',
    shots: [
      {
        n: 1,
        type: 'pot',
        ballId: OBJECT_BALL_ID,
        pocket: 'foot_left',
        cueBallTarget: { shape: 'circle', center: { x: 0.55, y: 0.3 }, radius: 0.08 },
        note: 'Half a tip of draw.',
      },
      {
        n: 2,
        type: 'pot',
        ballId: 'b2',
        pocket: 'side_right',
        cueBallTarget: { shape: 'rect', min: { x: 0.3, y: 0.1 }, max: { x: 0.5, y: 0.4 } },
      },
    ],
    success: { mode: 'count', attempts: 10, target: 7 },
    skills: ['cut-shot', 'position'],
    difficulty: 3,
    tags: ['warm-up'],
    provenance: {
      author: 'Test Author',
      createdAt: '2026-08-28T14:00:00Z',
      derivedFrom: 'some-other-drill',
      license: 'CC-BY-4.0',
    },
    extensions: { 'com.example.app': { colour: 'blue' } },
  };
}

/** A copy of `obj` without `key`. */
export function omit(obj: JsonObject, key: string): JsonObject {
  const copy = clone(obj);
  delete copy[key];
  return copy;
}

/** The minimal drill, shallow-merged with `patch`. */
export function drillWith(patch: JsonObject): JsonObject {
  return { ...(clone(minimalDrill()) as unknown as JsonObject), ...clone(patch) };
}

/** The minimal drill, without the given top-level keys. */
export function drillWithout(...keys: string[]): JsonObject {
  const doc = clone(minimalDrill()) as unknown as JsonObject;
  for (const key of keys) delete doc[key];
  return doc;
}

/** The minimal drill with its object ball shallow-merged with `patch`. */
export function withObjectBall(patch: JsonObject): JsonObject {
  const doc = clone(minimalDrill()) as unknown as JsonObject;
  const balls = doc.balls as JsonObject[];
  balls[OBJECT_BALL_INDEX] = { ...balls[OBJECT_BALL_INDEX], ...clone(patch) };
  return doc;
}

/** The minimal drill with the object ball's `at` replaced outright. */
export function withObjectBallAt(at: unknown): JsonObject {
  return withObjectBall({ at });
}

/** The minimal drill with its single shot shallow-merged with `patch`. */
export function withShot(patch: JsonObject): JsonObject {
  const doc = clone(minimalDrill()) as unknown as JsonObject;
  const shots = doc.shots as JsonObject[];
  shots[0] = { ...shots[0], ...clone(patch) };
  return doc;
}

/** The minimal drill with its single shot replaced outright. */
export function withShotExactly(shot: unknown): JsonObject {
  return drillWith({ shots: [shot] });
}

/** The minimal drill with `success` replaced outright. */
export function withSuccess(success: unknown): JsonObject {
  return drillWith({ success });
}
