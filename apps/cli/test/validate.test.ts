// `pooldrill validate` end to end: argument parsing, the file read, both
// validators, the terminal output, and the exit status — driven in-process
// through run(), the same function the binary calls.
//
// Valid input reuses the M1.9 fixture corpus in packages/core. Broken
// input lives in ./fixtures so the canonical fixtures stay valid.
import { mkdtemp, rm } from 'node:fs/promises';
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

describe('pooldrill validate: valid drills', () => {
  it('reports success for an M1.9 fixture and exits 0', async () => {
    const result = await pooldrill(
      'validate',
      coreFixture('fixtures/stop-shot-repetition.pooldrill.json'),
    );
    expect(result).toEqual({
      exitCode: 0,
      stdout: 'Valid drill: Straight stop shot to the foot-left pocket\n',
      stderr: '',
    });
  });

  it('stays lenient: a drill carrying unknown properties is valid', async () => {
    const result = await pooldrill(
      'validate',
      coreFixture('round-trip/unknown-fields.pooldrill.json'),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Valid drill: /);
    expect(result.stderr).toBe('');
  });
});

describe('pooldrill validate: failures', () => {
  let scratch: string;
  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'pooldrill-cli-'));
  });
  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('reports a missing file as a read error without a stack trace', async () => {
    const path = join(scratch, 'does-not-exist.json');
    const result = await pooldrill('validate', path);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(new RegExp(`^Cannot read file: ${escape(path)}\n`));
    expect(result.stderr).toContain('ENOENT');
    expect(result.stderr).not.toMatch(STACK_FRAME);
  });

  it('reports an unreadable path (a directory) as a read error', async () => {
    const result = await pooldrill('validate', scratch);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/^Cannot read file: /);
    expect(result.stderr).toContain('EISDIR');
    expect(result.stderr).not.toMatch(STACK_FRAME);
  });

  it('reports malformed JSON as invalid JSON, before any validation', async () => {
    const path = fixture('invalid-json.pooldrill.json');
    const result = await pooldrill('validate', path);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(new RegExp(`^Invalid JSON: ${escape(path)}\n  \\S`));
    expect(result.stderr).not.toMatch(/Schema validation|Semantic validation/);
    expect(result.stderr).not.toMatch(STACK_FRAME);
  });

  it('reports shape errors as a schema failure, with paths and messages', async () => {
    const path = fixture('schema-invalid.pooldrill.json');
    const result = await pooldrill('validate', path);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(
      new RegExp(`^Schema validation failed: ${escape(path)} \\(3 errors\\)\n`),
    );
    expect(result.stderr).toContain("  (root): must have required property 'title'\n");
    expect(result.stderr).toContain(
      '  /balls/1/role: must be equal to one of the allowed values (cue, object, obstacle)\n',
    );
    // Shape failure stops the pipeline: no semantic codes appear.
    expect(result.stderr).not.toMatch(/Semantic validation|[A-Z]+_[A-Z_]+/);
  });

  it('reports semantic issues with code, paths, and message', async () => {
    const path = fixture('semantic-invalid.pooldrill.json');
    const result = await pooldrill('validate', path);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n');
    expect(lines[0]).toBe(`Semantic validation failed: ${path} (2 issues)`);
    expect(lines[1]).toBe('  UNKNOWN_BALL_REFERENCE at shots[0].ballId');
    expect(lines[2]).toMatch(/^ {4}Shot references unknown ball id "missing"/);
    expect(lines[3]).toBe('  BALL_OVERLAP at balls[0], balls[1]');
    expect(lines[4]).toMatch(/^ {4}Balls "white" and "target" overlap/);
  });

  it('prints a pathless semantic issue as its code alone', async () => {
    const result = await pooldrill('validate', fixture('no-cue-ball.pooldrill.json'));

    expect(result.exitCode).not.toBe(0);
    const lines = result.stderr.split('\n');
    expect(lines[1]).toBe('  CUE_BALL_COUNT_INVALID');
    expect(lines[2]).toMatch(/^ {4}\S/);
  });
});

describe('pooldrill: invocation', () => {
  it('prints help listing the validate command', async () => {
    const result = await pooldrill('--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Usage: pooldrill /);
    expect(result.stdout).toContain('validate <drill.json>');
  });

  it('prints help for validate', async () => {
    const result = await pooldrill('validate', '--help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Usage: pooldrill validate \[options\] <drill\.json>/);
  });

  it('fails when validate is given no file', async () => {
    const result = await pooldrill('validate');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("missing required argument 'drill.json'");
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
