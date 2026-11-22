import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let invocations = 0;
function cli(command, path, strict = false) {
  const result = spawnSync(
    process.execPath,
    ['apps/cli/dist/index.js', command, ...(strict ? ['--strict'] : []), path],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  invocations++;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function valid(path, warnings = false) {
  const drill = JSON.parse(readFileSync(path, 'utf8'));
  const expected = `Valid drill: ${drill.title}\n`;
  assert.deepEqual(cli('validate', path), { status: 0, stdout: expected, stderr: '' });
  const strict = cli('validate', path, true);
  assert.equal(strict.status, 0);
  assert.equal(strict.stdout, expected);
  if (warnings) {
    assert.match(strict.stderr, /^Strict mode: \d+ unknown propert/);
    assert.match(strict.stderr, /  warning: .*unknown property/);
  } else assert.equal(strict.stderr, '');
  const fields = [
    drill.title,
    `Format:      ${drill.formatVersion}`,
    ...(drill.game ? [`Game:        ${drill.game}`] : []),
    `Table:       ${drill.authoredFor.tableSize}`,
    `Sequencing:  ${drill.sequencing}`,
    `Balls:       ${drill.balls.length}`,
    `Shots:       ${drill.shots.length}`,
    `Success:     ${drill.success.mode === 'count' ? `count (${drill.success.target} of ${drill.success.attempts} attempts)` : drill.success.mode}`,
  ];
  assert.deepEqual(cli('show', path), { status: 0, stdout: fields.join('\n') + '\n', stderr: '' });
}
for (const fixture of [
  'stop-shot-repetition',
  'three-ball-position-route',
  'ball-in-hand-kitchen',
  'any-order-potting',
  'obstacle-ball-drill',
])
  valid(`packages/core/test/fixtures/${fixture}.pooldrill.json`);
valid('packages/core/test/round-trip/unknown-fields.pooldrill.json', true);
const scratch = mkdtempSync(join(tmpdir(), 'pooldrill-smoke-'));
try {
  for (const [path, message] of [
    ['apps/cli/test/fixtures/schema-invalid.pooldrill.json', 'Schema validation failed:'],
    ['apps/cli/test/fixtures/semantic-invalid.pooldrill.json', 'Semantic validation failed:'],
    ['apps/cli/test/fixtures/invalid-json.pooldrill.json', 'Invalid JSON:'],
    [join(scratch, 'missing.json'), 'Cannot read file:'],
  ]) {
    const validation = cli('validate', path);
    for (const result of [validation, cli('validate', path, true), cli('show', path)]) {
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert(result.stderr.startsWith(`${message} ${path}`), result.stderr);
      assert.doesNotMatch(result.stderr, /^\s+at .+:\d+:\d+/m);
    }
    assert.deepEqual(cli('show', path), validation);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(
  `Compiled CLI smoke passed: ${invocations} invocations, five canonical fixtures, unknown fields and four failure modes.`,
);
