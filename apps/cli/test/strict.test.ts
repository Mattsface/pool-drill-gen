// `pooldrill validate --strict` (ADR-0006, rule 3): unknown properties are
// reported as warnings, derived from the schema, and never change the
// outcome, the exit status, or the document.
//
// findUnknownProperties() is tested directly for the schema walk —
// nesting, arrays, oneOf/if branches, open objects — and through run()
// for the output and exit status.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';
import { findUnknownProperties } from '../src/strict.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixture = (name: string): string => join(here, 'fixtures', name);
const coreFixturesDir = join(here, '../../../packages/core/test/fixtures');
const coreFixture = (name: string): string => join(coreFixturesDir, name);

const CORE_FIXTURES = [
  'any-order-potting.pooldrill.json',
  'ball-in-hand-kitchen.pooldrill.json',
  'obstacle-ball-drill.pooldrill.json',
  'stop-shot-repetition.pooldrill.json',
  'three-ball-position-route.pooldrill.json',
];

type Json = Record<string, any>;

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, 'utf-8')) as Json;
}

/** A fresh copy of a known-good drill with exact-point placements. */
function baseDrill(): Json {
  return readJson(coreFixture('stop-shot-repetition.pooldrill.json'));
}

function unknownPaths(document: unknown): string[] {
  return findUnknownProperties(document).map((w) => w.path);
}

async function pooldrill(...args: string[]) {
  let stdout = '';
  let stderr = '';
  const exitCode = await run(args, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

describe('findUnknownProperties: the schema walk', () => {
  it.each(CORE_FIXTURES)('finds nothing in the canonical fixture %s', (name) => {
    expect(findUnknownProperties(readJson(coreFixture(name)))).toEqual([]);
  });

  it('reports an unknown root property with its name and path', () => {
    const drill = { ...baseDrill(), titel: 'typo' };
    expect(findUnknownProperties(drill)).toEqual([
      { code: 'UNKNOWN_PROPERTY', path: '/titel', property: 'titel' },
    ]);
  });

  it('reports unknown properties in nested objects', () => {
    const drill = baseDrill();
    drill.authoredFor.playingSurface.widthInches = 50;
    drill.authoredFor.ballSet.weightOz = 6;
    drill.provenance.licence = 'MIT';
    expect(unknownPaths(drill)).toEqual([
      '/authoredFor/playingSurface/widthInches',
      '/authoredFor/ballSet/weightOz',
      '/provenance/licence',
    ]);
  });

  it('reports unknown properties inside array elements, by index', () => {
    const drill = baseDrill();
    drill.balls[1].colour = 'blue';
    drill.balls[0].at.z = 0;
    drill.shots[0].pockets = ['foot_left'];
    expect(unknownPaths(drill)).toEqual(['/balls/0/at/z', '/balls/1/colour', '/shots/0/pockets']);
  });

  it('reports an unknown subtree once, without descending into it', () => {
    const drill = { ...baseDrill(), future: { deeply: { nested: [{ thing: 1 }] } } };
    expect(unknownPaths(drill)).toEqual(['/future']);
  });

  it('accepts anything under extensions, the declared open object', () => {
    const drill = {
      ...baseDrill(),
      extensions: { 'com.example': { anything: { goes: [{ here: true }] } }, x: 1 },
    };
    expect(findUnknownProperties(drill)).toEqual([]);
  });

  it('escapes `/` and `~` in reported paths (RFC 6901)', () => {
    const drill = { ...baseDrill(), 'a/b~c': 1 };
    expect(findUnknownProperties(drill)).toEqual([
      { code: 'UNKNOWN_PROPERTY', path: '/a~1b~0c', property: 'a/b~c' },
    ]);
  });

  describe('conditional schema branches', () => {
    it('a point placement does not borrow region properties', () => {
      const drill = baseDrill();
      drill.balls[0].at.radius = 0.05;
      expect(unknownPaths(drill)).toEqual(['/balls/0/at/radius']);
    });

    it('a circle placement accepts circle fields and rejects rect and point fields', () => {
      const drill = baseDrill();
      drill.balls[0].at = {
        shape: 'circle',
        center: { x: 0.4, y: 0.3 },
        radius: 0.05,
        min: { x: 0, y: 0 },
        x: 0.4,
      };
      expect(unknownPaths(drill)).toEqual(['/balls/0/at/min', '/balls/0/at/x']);
    });

    it('a rect placement accepts rect fields and rejects circle fields', () => {
      const drill = readJson(coreFixture('ball-in-hand-kitchen.pooldrill.json'));
      drill.balls[0].at.radius = 0.05;
      drill.balls[0].at.max.z = 0;
      expect(unknownPaths(drill)).toEqual(['/balls/0/at/max/z', '/balls/0/at/radius']);
    });

    it('follows cueBallTarget through allOf into the region oneOf', () => {
      const drill = baseDrill();
      drill.shots[0].cueBallTarget = {
        shape: 'rect',
        min: { x: 0.5, y: 0.1 },
        max: { x: 0.6, y: 0.2, w: 1 },
        center: { x: 0.55, y: 0.15 },
      };
      expect(unknownPaths(drill)).toEqual([
        '/shots/0/cueBallTarget/max/w',
        '/shots/0/cueBallTarget/center',
      ]);
    });

    it('if/then requirements do not hide or invent declared properties', () => {
      // attempts/target are declared on success whatever the mode; the
      // `count` conditional only makes them required.
      const drill = baseDrill();
      drill.success = { mode: 'run_all', attempts: 3, target: 2, goal: 1 };
      expect(unknownPaths(drill)).toEqual(['/success/goal']);
    });

    it('on a malformed placement, reports only what no branch declares', () => {
      const drill = baseDrill();
      drill.balls[0].at = { shape: 'hexagon', center: { x: 0.4, y: 0.3 }, sides: 6 };
      expect(unknownPaths(drill)).toEqual(['/balls/0/at/sides']);
    });
  });

  it('returns the same warnings in the same order on every run', () => {
    const drill = readJson(fixture('unknown-properties.pooldrill.json'));
    const first = findUnknownProperties(drill);
    expect(findUnknownProperties(drill)).toEqual(first);
    expect(findUnknownProperties(structuredClone(drill))).toEqual(first);
  });

  it('does not mutate the document, and unknown properties survive', () => {
    const drill = readJson(fixture('unknown-properties.pooldrill.json'));
    const before = JSON.stringify(drill);
    deepFreeze(drill); // any write would throw in strict-mode ES modules
    findUnknownProperties(drill);
    expect(JSON.stringify(drill)).toBe(before);
    expect(drill.titel).toBe('Kitchen drill with authoring typos');
    expect(drill.balls[1].colour).toBe('blue');
  });
});

describe('pooldrill validate --strict', () => {
  const unknownFixture = fixture('unknown-properties.pooldrill.json');

  it('prints no warnings for a clean drill and exits 0', async () => {
    const result = await pooldrill(
      'validate',
      '--strict',
      coreFixture('stop-shot-repetition.pooldrill.json'),
    );
    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Valid drill: Straight stop shot to the foot-left pocket\n',
      stderr: '',
    });
  });

  it('without --strict, the same unknown-property drill is valid and silent', async () => {
    const result = await pooldrill('validate', unknownFixture);
    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Valid drill: Kitchen drill with authoring typos\n',
      stderr: '',
    });
  });

  it('with --strict, warns on stderr in document order and still exits 0', async () => {
    const result = await pooldrill('validate', '--strict', unknownFixture);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Valid drill: Kitchen drill with authoring typos\n');
    expect(result.stderr).toBe(
      [
        `Strict mode: 7 unknown properties in ${unknownFixture}`,
        '  warning: /titel: unknown property "titel"',
        '  warning: /authoredFor/playingSurface/widthInches: unknown property "widthInches"',
        '  warning: /balls/0/at/max/z: unknown property "z"',
        '  warning: /balls/0/at/radius: unknown property "radius"',
        '  warning: /balls/1/colour: unknown property "colour"',
        '  warning: /shots/0/pockets: unknown property "pockets"',
        '  warning: /provenance/licence: unknown property "licence"',
        // extensions content is open and never warned about.
        '',
      ].join('\n'),
    );
  });

  it('accepts the flag after the file argument too', async () => {
    const before = await pooldrill('validate', '--strict', unknownFixture);
    const after = await pooldrill('validate', unknownFixture, '--strict');
    expect(after).toEqual(before);
  });

  it('uses the singular for one warning', async () => {
    const path = fixture('strict-semantic-invalid.pooldrill.json');
    const result = await pooldrill('validate', '--strict', path);
    expect(result.stderr).toContain(`Strict mode: 1 unknown property in ${path}\n`);
  });

  it('keeps a schema failure (exit 1) and adds the warnings after it', async () => {
    const path = fixture('strict-schema-invalid.pooldrill.json');
    const result = await pooldrill('validate', '--strict', path);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      [
        `Schema validation failed: ${path} (2 errors)`,
        "  /shots/0: must have required property 'pocket'",
        '  /shots/0: must match "then" schema',
        `Strict mode: 1 unknown property in ${path}`,
        '  warning: /shots/0/pocet: unknown property "pocet"',
        '',
      ].join('\n'),
    );
  });

  it('keeps a semantic failure (exit 1) and adds the warnings after it', async () => {
    const path = fixture('strict-semantic-invalid.pooldrill.json');
    const result = await pooldrill('validate', '--strict', path);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n');
    expect(lines[0]).toBe(`Semantic validation failed: ${path} (1 issue)`);
    expect(lines[1]).toBe('  BALL_OVERLAP at balls[0], balls[1]');
    expect(lines.slice(3)).toEqual([
      `Strict mode: 1 unknown property in ${path}`,
      '  warning: /balls/1/lable: unknown property "lable"',
      '',
    ]);
  });

  it('without --strict, failures print exactly as before, with no warnings', async () => {
    for (const name of ['strict-schema-invalid.pooldrill.json', 'strict-semantic-invalid.pooldrill.json']) {
      const result = await pooldrill('validate', fixture(name));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).not.toMatch(/Strict mode|warning/);
    }
  });

  it('invalid JSON is still only an invalid-JSON failure', async () => {
    const result = await pooldrill('validate', '--strict', fixture('invalid-json.pooldrill.json'));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^Invalid JSON: /);
    expect(result.stderr).not.toMatch(/Strict mode/);
  });

  it('reports the M1.10 round-trip fixture’s future fields but not its extensions', async () => {
    const path = join(here, '../../../packages/core/test/round-trip/unknown-fields.pooldrill.json');
    const result = await pooldrill('validate', '--strict', path);
    expect(result.exitCode).toBe(0);
    expect(result.stderr.split('\n').filter((l) => l.startsWith('  warning:'))).toEqual([
      '  warning: /futureRootField: unknown property "futureRootField"',
      '  warning: /authoredFor/playingSurface/futureClothField: unknown property "futureClothField"',
      '  warning: /balls/0/futureBallField: unknown property "futureBallField"',
      '  warning: /shots/0/cueBallTarget/futureRegionField: unknown property "futureRegionField"',
    ]);
  });

  it('lists --strict in validate help', async () => {
    const result = await pooldrill('validate', '--help');
    expect(result.stdout).toContain('--strict');
  });
});

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}
