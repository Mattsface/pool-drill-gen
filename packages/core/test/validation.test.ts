// Tests for the M1.5 semantic validation framework.
//
// The framework has no rules yet, so these tests are about the contract
// rather than about any particular drill being wrong: the result shape,
// the code vocabulary, the valid/issues invariant, and the promise that
// core stays platform-neutral. Semantic-invalid cases arrive with the
// rules that reject them, in M1.6 and M1.8.
//
// Shape validation is the schema package's job and is tested there (244
// cases). Nothing here re-tests it, and nothing here compiles a schema.
import { describe, expect, it } from 'vitest';
import type { Drill } from '@pool-drill-gen/schema';
import {
  validateDrill,
  VALIDATION_CODES,
  type ValidationCode,
  type ValidationIssue,
  type ValidationResult,
} from '../src/index.js';

/**
 * A small schema-valid drill, local to this test file.
 *
 * Deliberately not a fixture: the representative corpus is M1.9 work, and
 * the schema package has its own factories. This exists so a test can
 * hand validateDrill() a real document without restating one each time.
 */
function validDrill(): Drill {
  return {
    format: 'pool-drill',
    formatVersion: '0.1',
    id: 'core-framework-test-drill',
    title: 'Framework test drill',
    authoredFor: {
      tableSize: '9ft',
      playingSurface: { lengthIn: 100, widthIn: 50 },
      ballSet: { ballDiameterIn: 2.25 },
    },
    balls: [
      { id: 'cue', role: 'cue', at: { x: 0.25, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.75, y: 0.25 } },
    ],
    sequencing: 'single_shot',
    shots: [{ n: 1, type: 'pot', ballId: 'b1', pocket: 'foot_right' }],
    success: { mode: 'run_all' },
    provenance: { createdAt: '2026-08-28T14:00:00Z' },
  };
}

describe('validateDrill', () => {
  it('accepts a schema-valid drill', () => {
    const result = validateDrill(validDrill());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports nothing while no semantic rule is implemented', () => {
    // M1.6 and M1.8 will make specific documents fail. Until then the
    // framework's answer for a shape-valid document is "no issues", and
    // this test is what says so out loud.
    const result: ValidationResult = validateDrill(validDrill());
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('returns a fresh issues array per call, with no state carried between calls', () => {
    const first = validateDrill(validDrill());
    first.issues.push({ code: 'BALL_OVERLAP', paths: ['balls[0]'], message: 'not real' });

    const second = validateDrill(validDrill());
    expect(second.issues).toEqual([]);
    expect(second.issues).not.toBe(first.issues);
  });

  it('does not mutate the drill it is handed', () => {
    const drill = validDrill();
    const before = JSON.stringify(drill);
    validateDrill(drill);
    expect(JSON.stringify(drill)).toBe(before);
  });

  it('preserves the valid/issues invariant', () => {
    const result = validateDrill(validDrill());
    expect(result.valid).toBe(result.issues.length === 0);
  });

  it('does not throw for documents a later rule will reject', () => {
    // These are schema-valid and semantically nonsense: no cue ball, an
    // unresolvable ballId, overlapping balls, a backwards rectangle. They
    // assert only that the framework returns rather than throwing —
    // deliberately not that they are valid, because M1.6 and M1.8 will
    // and should change that answer.
    const noCueBall = validDrill();
    noCueBall.balls = [{ id: 'b1', role: 'object', at: { x: 0.75, y: 0.25 } }];

    const danglingReference = validDrill();
    danglingReference.shots = [{ n: 1, type: 'pot', ballId: 'no-such-ball', pocket: 'foot_left' }];

    const overlapping = validDrill();
    overlapping.balls = [
      { id: 'cue', role: 'cue', at: { x: 0.5, y: 0.25 } },
      { id: 'b1', role: 'object', at: { x: 0.5, y: 0.25 } },
    ];

    const backwardsRect = validDrill();
    backwardsRect.balls = [
      { id: 'cue', role: 'cue', at: { x: 0.25, y: 0.25 } },
      {
        id: 'b1',
        role: 'object',
        at: { shape: 'rect', min: { x: 0.9, y: 0.4 }, max: { x: 0.1, y: 0.1 } },
      },
    ];

    for (const drill of [noCueBall, danglingReference, overlapping, backwardsRect]) {
      expect(() => validateDrill(drill)).not.toThrow();
    }
  });

  it('accepts a document carrying unknown properties', () => {
    // The format is lenient and round-trips must be lossless (ADR-0006),
    // so unknown keys reach core and must not upset it.
    const drill = validDrill();
    drill.somethingNobodyKnows = { nested: true };
    drill.extensions = { 'com.example.app': { colour: 'blue' } };
    expect(() => validateDrill(drill)).not.toThrow();
    expect(validateDrill(drill).valid).toBe(true);
  });
});

describe('public surface', () => {
  it('exports the result and issue types usably', () => {
    // Types are erased at runtime, so the real assertion here is the
    // compiler's: `pnpm test` type-checks this file through
    // tsconfig.test.json before Vitest runs it, and these annotations
    // stop compiling if the exported shapes drift.
    const issue: ValidationIssue = {
      code: 'BALL_OVERLAP',
      paths: ['balls[2]', 'balls[4]'],
      message: 'Balls b2 and b4 overlap at their authored positions.',
    };
    const result: ValidationResult = { valid: false, issues: [issue] };

    expect(result.issues[0]?.code).toBe('BALL_OVERLAP');
    expect(result.issues[0]?.paths).toEqual(['balls[2]', 'balls[4]']);
    expect(typeof result.issues[0]?.message).toBe('string');
  });

  it('exports the validation-code vocabulary', () => {
    expect(VALIDATION_CODES).toEqual([
      'CUE_BALL_COUNT_INVALID',
      'DUPLICATE_BALL_ID',
      'UNKNOWN_BALL_REFERENCE',
      'OBSTACLE_BALL_REFERENCED',
      'SHOT_NUMBERING_INVALID',
      'SHOT_COUNT_INVALID',
      'POINT_OUT_OF_BOUNDS',
      'REGION_OUT_OF_BOUNDS',
      'REGION_GEOMETRY_INVALID',
      'BALL_OVERLAP',
    ]);
  });

  it('keeps codes stable, unique, and machine-readable', () => {
    expect(new Set(VALIDATION_CODES).size).toBe(VALIDATION_CODES.length);
    for (const code of VALIDATION_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('derives ValidationCode from the exported vocabulary', () => {
    const codes: ValidationCode[] = [...VALIDATION_CODES];
    expect(codes).toHaveLength(VALIDATION_CODES.length);
  });
});

describe('platform neutrality', () => {
  // Every source file in this package, read through Vite's ?raw import so
  // that even this test needs no Node built-in. CI gets a proper
  // architecture boundary check in M1.13; this is the cheap version that
  // travels with the code.
  const sources = import.meta.glob('../src/**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('reads every source file in the package', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });

  it('imports no Node built-in, DOM, or platform API', () => {
    const forbidden = [
      /from\s+['"]node:/,
      /from\s+['"](fs|path|os|url|crypto|process|child_process)['"]/,
      /require\s*\(/,
      /\bprocess\s*\./,
      /\bglobalThis\s*\.\s*process\b/,
      /\bdocument\s*\./,
      /\bwindow\s*\./,
      /\b__dirname\b/,
      /\bBuffer\b/,
    ];

    for (const [file, source] of Object.entries(sources)) {
      // Comments mention `fs`, `process`, and the rules themselves; the
      // patterns above are written to match usage, not prose.
      for (const pattern of forbidden) {
        expect(pattern.test(source), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });
});
