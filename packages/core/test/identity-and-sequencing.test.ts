// M1.6 (issue #7): identity, shot references, and sequencing.
//
// Every document here is schema-valid — the schema package's boundary
// tests assert exactly that for the same shapes — and wrong as a drill.
// These tests are the other half of that boundary: what shape validation
// accepts, meaning validation rejects, with a structured code and paths.
//
// Nothing here checks geometry. Bounds, overlap, and region shape are
// M1.8 (issue #9), and the fixtures below are deliberately laid out so no
// future geometry rule turns a focused assertion into a surprise.
import { describe, expect, it } from 'vitest';
import type { Ball, Drill, Shot } from '@pool-drill-gen/schema';
import {
  validateDrill,
  VALIDATION_CODES,
  type ValidationCode,
  type ValidationIssue,
} from '../src/index.js';

/**
 * A schema-valid, semantically valid drill: one cue ball, unique ids, a
 * shot resolving to an object ball, `single_shot` with one shot.
 *
 * Local to this file for the same reason M1.5's is — the fixture corpus
 * is later work, and a test that mutates one field of a known-good
 * document says more than one that restates a whole drill.
 */
function validDrill(): Drill {
  return {
    format: 'pool-drill',
    formatVersion: '0.1',
    id: 'm1-6-test-drill',
    title: 'Identity and sequencing test drill',
    authoredFor: {
      tableSize: '9ft',
      playingSurface: { lengthIn: 100, widthIn: 50 },
      ballSet: { ballDiameterIn: 2.25 },
    },
    balls: [
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.7, y: 0.25 } },
    ],
    sequencing: 'single_shot',
    shots: [{ n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right' }],
    success: { mode: 'run_all' },
    provenance: { createdAt: '2026-08-28T14:00:00Z' },
  };
}

/** The valid drill with `balls` replaced outright. */
function withBalls(balls: [Ball, ...Ball[]]): Drill {
  return { ...validDrill(), balls };
}

/** The valid drill with `sequencing` and `shots` replaced outright. */
function withSequence(sequencing: Drill['sequencing'], shots: [Shot, ...Shot[]]): Drill {
  return { ...validDrill(), sequencing, shots };
}

/** The valid drill under the given sequencing, with one pot shot per number. */
function withShotNumbers(sequencing: Drill['sequencing'], numbers: [number, ...number[]]): Drill {
  const shots = numbers.map((n) => ({
    n,
    type: 'pot' as const,
    ballId: 'b1',
    pocket: 'foot_right' as const,
  })) as [Shot, ...Shot[]];
  return withSequence(sequencing, shots);
}

/** Every issue carrying the given code, in the order validateDrill reported them. */
function issuesWithCode(drill: Drill, code: ValidationCode): ValidationIssue[] {
  return validateDrill(drill).issues.filter((issue) => issue.code === code);
}

/** Every code reported for the drill, in order and with duplicates kept. */
function codesFor(drill: Drill): ValidationCode[] {
  return validateDrill(drill).issues.map((issue) => issue.code);
}

describe('exactly one cue ball', () => {
  it('accepts a drill with one cue ball', () => {
    expect(validateDrill(validDrill()).valid).toBe(true);
  });

  it('rejects a drill with no cue ball', () => {
    const drill = withBalls([{ id: 'b1', role: 'object', at: { x: 0.7, y: 0.25 } }]);
    const issues = issuesWithCode(drill, 'CUE_BALL_COUNT_INVALID');

    expect(validateDrill(drill).valid).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: 'CUE_BALL_COUNT_INVALID',
      // No offending ball exists to point at, so no path is invented.
      paths: [],
      message: 'Drill must contain exactly one cue ball; found 0.',
    });
  });

  it('rejects a drill with two cue balls, naming both', () => {
    const drill = withBalls([
      { id: 'cue-a', role: 'cue', at: { x: 0.2, y: 0.2 } },
      { id: 'b1', role: 'object', at: { x: 0.7, y: 0.25 } },
      { id: 'cue-b', role: 'cue', at: { x: 0.3, y: 0.3 } },
    ]);
    const issues = issuesWithCode(drill, 'CUE_BALL_COUNT_INVALID');

    expect(issues).toHaveLength(1);
    expect(issues[0]?.paths).toEqual(['balls[0]', 'balls[2]']);
    expect(issues[0]?.message).toContain('found 2');
  });

  it('reports the count once however many cue balls there are', () => {
    const drill = withBalls([
      { id: 'cue-a', role: 'cue', at: { x: 0.2, y: 0.2 } },
      { id: 'cue-b', role: 'cue', at: { x: 0.3, y: 0.3 } },
      { id: 'cue-c', role: 'cue', at: { x: 0.4, y: 0.4 } },
      { id: 'b1', role: 'object', at: { x: 0.7, y: 0.25 } },
    ]);
    const issues = issuesWithCode(drill, 'CUE_BALL_COUNT_INVALID');

    expect(issues).toHaveLength(1);
    expect(issues[0]?.paths).toEqual(['balls[0]', 'balls[1]', 'balls[2]']);
    expect(issues[0]?.message).toContain('found 3');
  });

  it('counts by role, never by id or label', () => {
    // ADR-0003: identity is opaque. A ball whose id happens to read "cue"
    // is not the cue ball, and the cue ball need not say so in its id.
    const drill = withBalls([
      { id: 'cue', role: 'object', at: { x: 0.7, y: 0.25 }, label: 'cue' },
      { id: 'whatever', role: 'cue', at: { x: 0.2, y: 0.25 } },
    ]);
    expect(issuesWithCode(drill, 'CUE_BALL_COUNT_INVALID')).toEqual([]);
  });
});

describe('unique ball ids', () => {
  it('accepts unique ids', () => {
    const drill = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.6, y: 0.2 } },
      { id: 'b2', role: 'object', at: { x: 0.7, y: 0.3 } },
    ]);
    expect(issuesWithCode(drill, 'DUPLICATE_BALL_ID')).toEqual([]);
  });

  it('rejects one duplicated id, naming both positions', () => {
    const drill = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.6, y: 0.2 } },
      { id: 'b1', role: 'object', at: { x: 0.7, y: 0.3 } },
    ]);
    const issues = issuesWithCode(drill, 'DUPLICATE_BALL_ID');

    expect(validateDrill(drill).valid).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: 'DUPLICATE_BALL_ID',
      paths: ['balls[1].id', 'balls[2].id'],
      message: 'Ball id "b1" is used more than once.',
    });
  });

  it('names every position when an id appears three times', () => {
    const drill = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.5, y: 0.2 } },
      { id: 'b1', role: 'object', at: { x: 0.6, y: 0.3 } },
      { id: 'b1', role: 'object', at: { x: 0.7, y: 0.4 } },
    ]);
    const issues = issuesWithCode(drill, 'DUPLICATE_BALL_ID');

    expect(issues).toHaveLength(1);
    expect(issues[0]?.paths).toEqual(['balls[1].id', 'balls[2].id', 'balls[3].id']);
  });

  it('reports two independently duplicated ids as two issues', () => {
    const drill = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.4, y: 0.2 } },
      { id: 'b2', role: 'object', at: { x: 0.5, y: 0.3 } },
      { id: 'b1', role: 'object', at: { x: 0.6, y: 0.4 } },
      { id: 'b2', role: 'object', at: { x: 0.7, y: 0.15 } },
    ]);
    const issues = issuesWithCode(drill, 'DUPLICATE_BALL_ID');

    expect(issues).toHaveLength(2);
    // Ordered by each id's first occurrence, so output is stable.
    expect(issues[0]?.paths).toEqual(['balls[1].id', 'balls[3].id']);
    expect(issues[0]?.message).toContain('"b1"');
    expect(issues[1]?.paths).toEqual(['balls[2].id', 'balls[4].id']);
    expect(issues[1]?.message).toContain('"b2"');
  });

  it('does not treat a shared ball number as a duplicate identity', () => {
    // ADR-0003: `number` is display data. Nothing is keyed by it.
    const drill = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.6, y: 0.2 }, number: 3 },
      { id: 'b2', role: 'object', at: { x: 0.7, y: 0.3 }, number: 3 },
    ]);
    expect(issuesWithCode(drill, 'DUPLICATE_BALL_ID')).toEqual([]);
  });

  it('does not confuse an id with an Object prototype property name', () => {
    const drill = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      { id: 'constructor', role: 'object', at: { x: 0.6, y: 0.2 } },
      { id: '__proto__', role: 'object', at: { x: 0.7, y: 0.3 } },
    ]);
    const drillWithShot: Drill = {
      ...drill,
      shots: [{ n: 1, type: 'pot', ballId: '__proto__', pocket: 'foot_right' }],
    };

    expect(issuesWithCode(drill, 'DUPLICATE_BALL_ID')).toEqual([]);
    expect(validateDrill(drillWithShot).valid).toBe(true);
  });
});

describe('shot ball references', () => {
  it('accepts a shot referencing a declared object ball', () => {
    expect(issuesWithCode(validDrill(), 'UNKNOWN_BALL_REFERENCE')).toEqual([]);
  });

  it('rejects a shot whose ballId resolves to nothing', () => {
    const drill: Drill = {
      ...validDrill(),
      shots: [{ n: 1, type: 'pot', ballId: 'b7', pocket: 'foot_right' }],
    };
    const issues = issuesWithCode(drill, 'UNKNOWN_BALL_REFERENCE');

    expect(validateDrill(drill).valid).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: 'UNKNOWN_BALL_REFERENCE',
      paths: ['shots[0].ballId'],
      message: 'Shot references unknown ball id "b7".',
    });
  });

  it('reports one focused issue per unresolved reference', () => {
    const drill = withSequence('any_order', [
      { n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right' },
      { n: 2, type: 'pot', ballId: 'nope', pocket: 'foot_left' },
      { n: 3, type: 'pot', ballId: 'also-nope', pocket: 'side_left' },
    ]);
    const issues = issuesWithCode(drill, 'UNKNOWN_BALL_REFERENCE');

    expect(issues).toHaveLength(2);
    expect(issues[0]?.paths).toEqual(['shots[1].ballId']);
    expect(issues[1]?.paths).toEqual(['shots[2].ballId']);
  });

  it('does not resolve a reference by ball number', () => {
    // A shot referencing "3" must not find the ball numbered 3.
    const drill: Drill = {
      ...withBalls([
        { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
        { id: 'b1', role: 'object', at: { x: 0.7, y: 0.25 }, number: 3 },
      ]),
      shots: [{ n: 1, type: 'pot', ballId: '3', pocket: 'foot_right' }],
    };
    expect(issuesWithCode(drill, 'UNKNOWN_BALL_REFERENCE')).toHaveLength(1);
  });

  it('rejects a shot referencing an obstacle ball, naming both sides', () => {
    const drill: Drill = {
      ...withBalls([
        { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
        { id: 'b1', role: 'object', at: { x: 0.7, y: 0.25 } },
        { id: 'blocker', role: 'obstacle', at: { x: 0.5, y: 0.1 } },
      ]),
      shots: [
        { n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right' },
        { n: 2, type: 'pot', ballId: 'blocker', pocket: 'foot_left' },
      ],
      sequencing: 'strict',
    };
    const issues = issuesWithCode(drill, 'OBSTACLE_BALL_REFERENCED');

    expect(validateDrill(drill).valid).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: 'OBSTACLE_BALL_REFERENCED',
      paths: ['shots[1].ballId', 'balls[2].role'],
      message: 'Shots may not reference obstacle balls.',
    });
  });

  it('does not also report an obstacle reference for an unresolved one', () => {
    // One mistake, one issue: an unresolved ballId has no role to judge.
    const drill: Drill = {
      ...withBalls([
        { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
        { id: 'blocker', role: 'obstacle', at: { x: 0.5, y: 0.1 } },
      ]),
      shots: [{ n: 1, type: 'pot', ballId: 'no-such-ball', pocket: 'foot_right' }],
    };

    expect(codesFor(drill)).toEqual(['UNKNOWN_BALL_REFERENCE']);
  });

  it('does not add a rule for a shot referencing the cue ball', () => {
    // Deliberate, and a known discrepancy (see rules.ts): issue #7
    // forbids only obstacle references, ADR-0003 states the obstacle rule
    // and no cue-ball equivalent, and the M1.5 code vocabulary has no
    // code for one. Until an ADR settles it, M1.6 adds no issue here.
    const drill: Drill = {
      ...validDrill(),
      shots: [{ n: 1, type: 'pot', ballId: 'cue', pocket: 'foot_right' }],
    };

    expect(validateDrill(drill)).toEqual({ valid: true, issues: [] });
  });

  it('has no code that would let a cue-ball reference be reported', () => {
    // Guards the decision above from being smuggled in under a borrowed
    // code: a CUE_BALL_REFERENCED rule would need a code, and adding one
    // should break this test and force the conversation.
    const codes: readonly string[] = VALIDATION_CODES;
    expect(codes).not.toContain('CUE_BALL_REFERENCED');
  });
});

describe('strict sequencing', () => {
  const contiguous: [number, ...number[]][] = [[1], [1, 2], [1, 2, 3]];
  for (const numbers of contiguous) {
    it(`accepts contiguous numbering from 1: [${numbers.join(', ')}]`, () => {
      const drill = withShotNumbers('strict', numbers);
      expect(issuesWithCode(drill, 'SHOT_NUMBERING_INVALID')).toEqual([]);
      expect(validateDrill(drill).valid).toBe(true);
    });
  }

  it('rejects numbering that starts above 1', () => {
    const drill = withShotNumbers('strict', [2]);
    const issues = issuesWithCode(drill, 'SHOT_NUMBERING_INVALID');

    expect(validateDrill(drill).valid).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: 'SHOT_NUMBERING_INVALID',
      paths: ['shots[0].n'],
      message: 'Strict sequencing expected shot number 1; found 2.',
    });
  });

  it('rejects a gap', () => {
    const drill = withShotNumbers('strict', [1, 3]);
    const issues = issuesWithCode(drill, 'SHOT_NUMBERING_INVALID');

    expect(issues).toHaveLength(1);
    expect(issues[0]?.paths).toEqual(['shots[1].n']);
    expect(issues[0]?.message).toBe('Strict sequencing expected shot number 2; found 3.');
  });

  it('rejects a duplicate number', () => {
    const drill = withShotNumbers('strict', [1, 1]);
    const issues = issuesWithCode(drill, 'SHOT_NUMBERING_INVALID');

    expect(issues).toHaveLength(1);
    expect(issues[0]?.paths).toEqual(['shots[1].n']);
    expect(issues[0]?.message).toBe('Strict sequencing expected shot number 2; found 1.');
  });

  it('rejects reordered numbers without sorting them first', () => {
    // [3, 1, 2] is the whole set 1..3 and is still wrong: the array order
    // is the authored sequence, so sorting before comparing would accept
    // exactly the mistake this rule exists to catch.
    const drill = withShotNumbers('strict', [3, 1, 2]);
    const issues = issuesWithCode(drill, 'SHOT_NUMBERING_INVALID');

    expect(issues).toHaveLength(3);
    expect(issues.map((issue) => issue.paths)).toEqual([
      ['shots[0].n'],
      ['shots[1].n'],
      ['shots[2].n'],
    ]);
    expect(issues[0]?.message).toBe('Strict sequencing expected shot number 1; found 3.');
    expect(issues[1]?.message).toBe('Strict sequencing expected shot number 2; found 1.');
    expect(issues[2]?.message).toBe('Strict sequencing expected shot number 3; found 2.');
  });

  it('reports one issue per offending shot, leaving correct ones alone', () => {
    const drill = withShotNumbers('strict', [1, 5, 3, 9]);
    const issues = issuesWithCode(drill, 'SHOT_NUMBERING_INVALID');

    expect(issues.map((issue) => issue.paths)).toEqual([['shots[1].n'], ['shots[3].n']]);
  });

  it('does not constrain how many shots a strict drill has', () => {
    const drill = withShotNumbers('strict', [1, 2, 3, 4, 5]);
    expect(validateDrill(drill).valid).toBe(true);
  });
});

describe('single_shot cardinality', () => {
  it('accepts exactly one shot', () => {
    expect(issuesWithCode(validDrill(), 'SHOT_COUNT_INVALID')).toEqual([]);
  });

  it('rejects more than one shot', () => {
    const drill = withShotNumbers('single_shot', [1, 2]);
    const issues = issuesWithCode(drill, 'SHOT_COUNT_INVALID');

    expect(validateDrill(drill).valid).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: 'SHOT_COUNT_INVALID',
      paths: ['shots'],
      message: 'single_shot sequencing requires exactly one shot; found 2.',
    });
  });

  it('counts every extra shot in the message', () => {
    const drill = withShotNumbers('single_shot', [1, 2, 3]);
    expect(issuesWithCode(drill, 'SHOT_COUNT_INVALID')[0]?.message).toContain('found 3.');
  });

  it('does not impose strict numbering on its one shot', () => {
    // `n` is binding under "strict" only (ADR-0009). A lone shot numbered
    // 4 is odd, but 0.1 defines no rule that makes it wrong.
    const drill = withShotNumbers('single_shot', [4]);
    expect(validateDrill(drill)).toEqual({ valid: true, issues: [] });
  });
});

describe('any_order numbering is display-only', () => {
  const displayOnly: [number, ...number[]][] = [
    [1, 1, 1],
    [4, 9, 200],
    [3, 2, 1],
  ];
  for (const numbers of displayOnly) {
    it(`reports no numbering issue for [${numbers.join(', ')}]`, () => {
      const drill = withShotNumbers('any_order', numbers);

      expect(issuesWithCode(drill, 'SHOT_NUMBERING_INVALID')).toEqual([]);
      expect(validateDrill(drill)).toEqual({ valid: true, issues: [] });
    });
  }

  it('does not apply single_shot cardinality to any_order', () => {
    const drill = withShotNumbers('any_order', [1, 2, 3, 4]);
    expect(issuesWithCode(drill, 'SHOT_COUNT_INVALID')).toEqual([]);
  });

  it('still checks identity and references under any_order', () => {
    // Display-only numbering relaxes numbering, nothing else.
    const drill = withSequence('any_order', [
      { n: 7, type: 'pot', ballId: 'nope', pocket: 'foot_right' },
    ]);
    expect(codesFor(drill)).toEqual(['UNKNOWN_BALL_REFERENCE']);
  });
});

describe('aggregation across rules', () => {
  it('reports every independent failure rather than stopping at the first', () => {
    const drill: Drill = {
      ...validDrill(),
      balls: [
        { id: 'b1', role: 'object', at: { x: 0.4, y: 0.2 } },
        { id: 'b1', role: 'object', at: { x: 0.6, y: 0.3 } },
        { id: 'blocker', role: 'obstacle', at: { x: 0.5, y: 0.1 } },
      ],
      sequencing: 'strict',
      shots: [
        { n: 2, type: 'pot', ballId: 'b1', pocket: 'foot_right' },
        { n: 5, type: 'pot', ballId: 'ghost', pocket: 'foot_left' },
        { n: 9, type: 'pot', ballId: 'blocker', pocket: 'side_left' },
      ],
    };
    const result = validateDrill(drill);

    expect(result.valid).toBe(false);
    // No cue ball, a duplicated id, a dangling reference, an obstacle
    // reference, and three wrong strict shot numbers — all at once, in
    // document order: balls, then shots, then sequencing.
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'CUE_BALL_COUNT_INVALID',
      'DUPLICATE_BALL_ID',
      'UNKNOWN_BALL_REFERENCE',
      'OBSTACLE_BALL_REFERENCED',
      'SHOT_NUMBERING_INVALID',
      'SHOT_NUMBERING_INVALID',
      'SHOT_NUMBERING_INVALID',
    ]);
    expect(result.issues.map((issue) => issue.paths)).toEqual([
      [],
      ['balls[0].id', 'balls[1].id'],
      ['shots[1].ballId'],
      ['shots[2].ballId', 'balls[2].role'],
      ['shots[0].n'],
      ['shots[1].n'],
      ['shots[2].n'],
    ]);
  });

  it('keeps the valid/issues invariant while failing', () => {
    const drill = withShotNumbers('strict', [2]);
    const result = validateDrill(drill);
    expect(result.valid).toBe(result.issues.length === 0);
    expect(result.valid).toBe(false);
  });

  it('returns the same issues for the same document every call', () => {
    const drill: Drill = {
      ...validDrill(),
      balls: [
        { id: 'dup', role: 'object', at: { x: 0.4, y: 0.2 } },
        { id: 'dup', role: 'object', at: { x: 0.6, y: 0.3 } },
        { id: 'other', role: 'object', at: { x: 0.8, y: 0.3 } },
        { id: 'other', role: 'object', at: { x: 0.9, y: 0.4 } },
      ],
      shots: [{ n: 1, type: 'pot', ballId: 'missing', pocket: 'foot_right' }],
    };

    const first = validateDrill(drill);
    const second = validateDrill(drill);
    expect(second.issues).toEqual(first.issues);
    expect(second.issues).not.toBe(first.issues);
  });

  it('does not mutate the drill while reporting failures', () => {
    const drill = withShotNumbers('single_shot', [1, 2, 3]);
    const before = JSON.stringify(drill);
    validateDrill(drill);
    expect(JSON.stringify(drill)).toBe(before);
  });

  it('does not throw on a document carrying unknown properties', () => {
    // Leniency and lossless round-trips (ADR-0006) mean unknown keys
    // reach core alongside real failures.
    const drill: Drill = {
      ...withShotNumbers('strict', [4]),
      somethingNobodyKnows: { nested: true },
    };
    drill.shots[0].houseRule = 'call it';

    expect(() => validateDrill(drill)).not.toThrow();
    expect(codesFor(drill)).toEqual(['SHOT_NUMBERING_INVALID']);
  });
});

describe('no geometry rule is implemented here', () => {
  it('accepts positions outside the playing surface', () => {
    // M1.8 (issue #9) owns bounds. Until then a wild coordinate is
    // semantically valid, and this test says so rather than leaving the
    // silence ambiguous.
    const drill = withBalls([
      { id: 'cue', role: 'cue', at: { x: 5, y: -3 } },
      { id: 'b1', role: 'object', at: { x: -0.0001, y: 0.9 } },
    ]);
    expect(validateDrill(drill)).toEqual({ valid: true, issues: [] });
  });

  it('accepts balls placed on top of one another and a backwards rectangle', () => {
    const overlapping = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.5, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.5, y: 0.25 } },
    ]);
    const backwardsRect = withBalls([
      { id: 'cue', role: 'cue', at: { x: 0.2, y: 0.25 } },
      {
        id: 'b1',
        role: 'object',
        at: { shape: 'rect', min: { x: 0.9, y: 0.4 }, max: { x: 0.1, y: 0.1 } },
      },
    ]);

    expect(validateDrill(overlapping).valid).toBe(true);
    expect(validateDrill(backwardsRect).valid).toBe(true);
  });
});
