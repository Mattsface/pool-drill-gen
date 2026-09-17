// The schema/semantic boundary.
//
// CLAUDE.md splits validation in two: JSON Schema validates *shape*;
// validateDrill() in @pool-drill-gen/core validates *meaning*. Every
// document below is nonsense as a drill and correct as JSON, and the shape
// validator must therefore accept it.
//
// These are not aspirational tests. They are a guard against schema creep:
// if one of them starts failing, a semantic rule has leaked into the
// schema, where it cannot produce a structured error code and cannot be
// expressed at all for the harder cases (region feasibility, non-overlap).
//
// Do not "fix" a failure here by relaxing the assertion — the rules listed
// here belong to core.
import { describe, it } from 'vitest';
import { expectValid } from './helpers/validate.js';
import { drillWith, withObjectBallAt, withSuccess, OBJECT_BALL_ID } from './helpers/drills.js';

describe('identity and references — enforced in core, not here', () => {
  it('accepts duplicate ball ids', () => {
    expectValid(
      drillWith({
        balls: [
          { id: 'cue', role: 'cue', at: { x: 0.25, y: 0.25 } },
          { id: 'dup', role: 'object', at: { x: 0.6, y: 0.2 } },
          { id: 'dup', role: 'object', at: { x: 0.7, y: 0.3 } },
        ],
        shots: [{ n: 1, type: 'pot', ballId: 'dup', pocket: 'foot_left' }],
      }),
    );
  });

  it('accepts a drill with no cue ball', () => {
    expectValid(
      drillWith({
        balls: [{ id: 'b1', role: 'object', at: { x: 0.6, y: 0.2 } }],
      }),
    );
  });

  it('accepts a drill with several cue balls', () => {
    expectValid(
      drillWith({
        balls: [
          { id: 'cue-a', role: 'cue', at: { x: 0.2, y: 0.2 } },
          { id: 'cue-b', role: 'cue', at: { x: 0.3, y: 0.3 } },
          { id: 'b1', role: 'object', at: { x: 0.6, y: 0.2 } },
        ],
      }),
    );
  });

  it('accepts a shot whose ballId resolves to nothing', () => {
    expectValid(
      drillWith({ shots: [{ n: 1, type: 'pot', ballId: 'no-such-ball', pocket: 'foot_left' }] }),
    );
  });

  it('accepts a shot that references an obstacle ball', () => {
    expectValid(
      drillWith({
        balls: [
          { id: 'cue', role: 'cue', at: { x: 0.25, y: 0.25 } },
          { id: 'blocker', role: 'obstacle', at: { x: 0.6, y: 0.2 } },
        ],
        shots: [{ n: 1, type: 'pot', ballId: 'blocker', pocket: 'foot_left' }],
      }),
    );
  });

  it('accepts a shot that references the cue ball', () => {
    expectValid(
      drillWith({ shots: [{ n: 1, type: 'pot', ballId: 'cue', pocket: 'foot_left' }] }),
    );
  });
});

describe('sequencing and shot numbering — enforced in core, not here', () => {
  it('accepts non-contiguous shot numbers under strict sequencing', () => {
    expectValid(
      drillWith({
        sequencing: 'strict',
        shots: [
          { n: 1, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_left' },
          { n: 3, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_right' },
        ],
      }),
    );
  });

  it('accepts duplicate shot numbers under strict sequencing', () => {
    expectValid(
      drillWith({
        sequencing: 'strict',
        shots: [
          { n: 1, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_left' },
          { n: 1, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_right' },
        ],
      }),
    );
  });

  it('accepts shot numbers that do not start at 1 under strict sequencing', () => {
    expectValid(
      drillWith({
        sequencing: 'strict',
        shots: [{ n: 4, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_left' }],
      }),
    );
  });

  it('accepts single_shot with more than one shot', () => {
    expectValid(
      drillWith({
        sequencing: 'single_shot',
        shots: [
          { n: 1, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_left' },
          { n: 2, type: 'pot', ballId: OBJECT_BALL_ID, pocket: 'foot_right' },
        ],
      }),
    );
  });
});

describe('geometry — enforced in core, not here', () => {
  it('accepts a rectangle whose min is greater than its max', () => {
    expectValid(
      withObjectBallAt({
        shape: 'rect',
        min: { x: 0.9, y: 0.4 },
        max: { x: 0.1, y: 0.1 },
      }),
    );
  });

  it('accepts a degenerate rectangle with min equal to max', () => {
    expectValid(
      withObjectBallAt({
        shape: 'rect',
        min: { x: 0.4, y: 0.2 },
        max: { x: 0.4, y: 0.2 },
      }),
    );
  });

  it('accepts coordinates outside the playing surface', () => {
    // x ∈ [0, 1] and y ∈ [0, W/L] are real constraints, but the y bound is
    // computed from the drill's own playingSurface, so they can only be
    // checked where that is in hand — in core, not in the schema.
    expectValid(withObjectBallAt({ x: 5, y: -3 }));
    expectValid(withObjectBallAt({ x: -0.0001, y: 0.9 }));
    expectValid(
      withObjectBallAt({ shape: 'circle', center: { x: 2, y: 2 }, radius: 1.5 }),
    );
  });

  it('accepts balls placed on top of one another', () => {
    expectValid(
      drillWith({
        balls: [
          { id: 'cue', role: 'cue', at: { x: 0.5, y: 0.25 } },
          { id: 'b1', role: 'object', at: { x: 0.5, y: 0.25 } },
          { id: 'b2', role: 'object', at: { x: 0.5001, y: 0.25 } },
        ],
      }),
    );
  });

  it('accepts a region too small to hold a ball', () => {
    // Region-versus-ball feasibility is a documented 0.1 gap (ADR-0008).
    expectValid(
      withObjectBallAt({ shape: 'circle', center: { x: 0.5, y: 0.25 }, radius: 1e-9 }),
    );
  });

  it('accepts a playingSurface that contradicts the tableSize label', () => {
    // The label is non-authoritative; a mismatch warns in core.
    expectValid(
      drillWith({
        authoredFor: {
          tableSize: '9ft',
          playingSurface: { lengthIn: 78, widthIn: 39 },
          ballSet: { ballDiameterIn: 2.25 },
        },
      }),
    );
  });

  it('accepts a ball larger than the table', () => {
    expectValid(
      drillWith({
        authoredFor: {
          tableSize: '7ft',
          playingSurface: { lengthIn: 78, widthIn: 39 },
          ballSet: { ballDiameterIn: 500 },
        },
      }),
    );
  });
});

describe('success cross-field rules — enforced in core, not here', () => {
  it('accepts target greater than attempts', () => {
    expectValid(withSuccess({ mode: 'count', attempts: 5, target: 9 }));
  });

  it('accepts count fields alongside run_all', () => {
    expectValid(withSuccess({ mode: 'run_all', attempts: 10, target: 7 }));
  });
});

describe('provenance — enforced in core, not here', () => {
  it('accepts a timestamp whose calendar date does not exist', () => {
    // The pattern checks layout and component ranges, not the calendar.
    // Whether an impossible date is worth a semantic check is a question
    // for core, not a reason to add a date library to the schema package.
    expectValid(drillWith({ provenance: { createdAt: '2026-02-30T00:00:00Z' } }));
  });

  it('accepts a derivedFrom pointing at a drill that does not exist', () => {
    expectValid(
      drillWith({
        provenance: { createdAt: '2026-08-28T14:00:00Z', derivedFrom: 'nothing-here' },
      }),
    );
  });
});
