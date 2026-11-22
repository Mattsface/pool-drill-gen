// `pooldrill show` end to end, driven in-process through run().
//
// Valid input is the M1.9 fixture corpus in packages/core; broken input
// reuses the `validate` fixtures in ./fixtures, because `show` reports
// failures through the same pipeline and formatter.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixture = (name: string): string => join(here, 'fixtures', name);
const coreFixture = (name: string): string =>
  join(here, '../../../packages/core/test', name);

interface Invocation {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function pooldrill(...args: string[]): Promise<Invocation> {
  let stdout = '';
  let stderr = '';
  const exitCode = await run(args, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

/** A Node stack frame, as it would appear in an unhandled-error dump. */
const STACK_FRAME = /^\s+at .+:\d+:\d+\)?$/m;

describe('pooldrill show: canonical fixtures', () => {
  const cases: [string, string][] = [
    [
      'three-ball-position-route',
      [
        'Three-ball alternating-corner route',
        'Format:      0.1',
        'Game:        9-ball',
        'Table:       9ft',
        'Sequencing:  strict',
        'Balls:       4',
        'Shots:       3',
        'Success:     run_all',
      ].join('\n'),
    ],
    [
      'any-order-potting',
      [
        'Four-ball open-table clearance',
        'Format:      0.1',
        'Table:       8ft',
        'Sequencing:  any_order',
        'Balls:       5',
        'Shots:       4',
        'Success:     run_all',
      ].join('\n'),
    ],
    [
      'stop-shot-repetition',
      [
        'Straight stop shot to the foot-left pocket',
        'Format:      0.1',
        'Table:       9ft',
        'Sequencing:  single_shot',
        'Balls:       2',
        'Shots:       1',
        'Success:     count (7 of 10 attempts)',
      ].join('\n'),
    ],
    [
      'ball-in-hand-kitchen',
      [
        'Ball in hand behind the head string',
        'Format:      0.1',
        'Table:       9ft',
        'Sequencing:  single_shot',
        'Balls:       2',
        'Shots:       1',
        'Success:     count (7 of 10 attempts)',
      ].join('\n'),
    ],
    [
      // Counts the obstacle ball alongside the cue and object balls.
      'obstacle-ball-drill',
      [
        'Pot beside a blocking ball',
        'Format:      0.1',
        'Table:       9ft',
        'Sequencing:  single_shot',
        'Balls:       3',
        'Shots:       1',
        'Success:     count (6 of 10 attempts)',
      ].join('\n'),
    ],
  ];

  it.each(cases)('summarises %s on stdout and exits 0', async (name, expected) => {
    const result = await pooldrill('show', coreFixture(`fixtures/${name}.pooldrill.json`));
    expect(result).toEqual({ exitCode: 0, stdout: `${expected}\n`, stderr: '' });
  });

  it('omits the Game line, and never prints undefined, when no game is named', async () => {
    const result = await pooldrill('show', coreFixture('fixtures/any-order-potting.pooldrill.json'));
    expect(result.stdout).not.toContain('Game:');
    expect(result.stdout).not.toContain('undefined');
  });

  it('is deterministic', async () => {
    const path = coreFixture('fixtures/three-ball-position-route.pooldrill.json');
    const first = await pooldrill('show', path);
    const second = await pooldrill('show', path);
    expect(second).toEqual(first);
  });

  it('stays lenient and does not print unknown or extension data', async () => {
    const path = coreFixture('round-trip/unknown-fields.pooldrill.json');
    const result = await pooldrill('show', path);
    expect(result).toEqual({
      exitCode: 0,
      stdout: [
        'Stop shot carrying fields from a later format',
        'Format:      0.1',
        'Table:       9ft',
        'Sequencing:  single_shot',
        'Balls:       2',
        'Shots:       1',
        'Success:     count (7 of 10 attempts)',
        '',
      ].join('\n'),
      stderr: '',
    });
  });
});

describe('pooldrill show: failures', () => {
  let scratch: string;
  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'pooldrill-show-'));
  });
  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  /** show must fail exactly as validate does: same stderr, no stdout, exit 1. */
  async function expectSameFailureAsValidate(path: string): Promise<Invocation> {
    const shown = await pooldrill('show', path);
    const validated = await pooldrill('validate', path);
    expect(shown.exitCode).toBe(1);
    expect(shown.stdout).toBe('');
    expect(shown.stderr).toBe(validated.stderr);
    expect(shown.stderr).not.toMatch(STACK_FRAME);
    return shown;
  }

  it('reports a missing file as a read error', async () => {
    const result = await expectSameFailureAsValidate(join(scratch, 'does-not-exist.json'));
    expect(result.stderr).toMatch(/^Cannot read file: /);
    expect(result.stderr).toContain('ENOENT');
  });

  it('reports an unreadable path (a directory) as a read error', async () => {
    const result = await expectSameFailureAsValidate(scratch);
    expect(result.stderr).toMatch(/^Cannot read file: /);
    expect(result.stderr).toContain('EISDIR');
  });

  it('reports malformed JSON', async () => {
    const result = await expectSameFailureAsValidate(fixture('invalid-json.pooldrill.json'));
    expect(result.stderr).toMatch(/^Invalid JSON: /);
  });

  it('reports a schema failure', async () => {
    const result = await expectSameFailureAsValidate(fixture('schema-invalid.pooldrill.json'));
    expect(result.stderr).toMatch(/^Schema validation failed: /);
  });

  it('reports a semantic failure', async () => {
    const result = await expectSameFailureAsValidate(fixture('semantic-invalid.pooldrill.json'));
    expect(result.stderr).toMatch(/^Semantic validation failed: /);
    expect(result.stderr).toContain('BALL_OVERLAP');
  });

  it('rejects an unsupported format version through the schema', async () => {
    const source = coreFixture('fixtures/stop-shot-repetition.pooldrill.json');
    const drill = JSON.parse(await readFile(source, 'utf-8')) as Record<string, unknown>;
    const path = join(scratch, 'future-version.pooldrill.json');
    await writeFile(path, JSON.stringify({ ...drill, formatVersion: '1.0' }));

    const result = await expectSameFailureAsValidate(path);
    expect(result.stderr).toMatch(/^Schema validation failed: /);
    expect(result.stderr).toContain('/formatVersion');
  });
});

describe('pooldrill show: invocation', () => {
  it('is listed in top-level help alongside validate', async () => {
    const result = await pooldrill('--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('validate [options] <drill.json>');
    expect(result.stdout).toContain('show <drill.json>');
  });

  it('prints help for show', async () => {
    const result = await pooldrill('show', '--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Usage: pooldrill show \[options\] <drill\.json>/);
  });

  it('fails when show is given no file', async () => {
    const result = await pooldrill('show');
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("missing required argument 'drill.json'");
  });
});
