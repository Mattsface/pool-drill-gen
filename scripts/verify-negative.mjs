// Opt-in destructive probes of tracked outputs/source, always restored in finally.
// Run only with no concurrent builds/tests. Never part of the normal CI gate.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 120000 });
  assert.ifError(r.error);
  assert.equal(r.signal, null);
  return r;
}
function fails(label, path, mutation, command, args, diagnostic, extraRestore = []) {
  const paths = [path, ...extraRestore];
  const saved = paths.map((p) => existsSync(p) ? readFileSync(p) : null);
  try {
    writeFileSync(path, mutation(saved[0]?.toString() ?? ''));
    const result = run(command, args);
    assert.notEqual(result.status, 0, `${label} unexpectedly passed`);
    assert.match(result.stdout + result.stderr, diagnostic, `${label}: wrong failure`);
    console.log(`Detected: ${label}`);
  } finally {
    paths.forEach((p, i) => saved[i] === null ? unlinkSync(p) : writeFileSync(p, saved[i]));
  }
}
for (const [generator, artifact] of [['types', 'drill.ts'], ['validator', 'drill.validator.js']]) {
  fails(`generated ${artifact} drift`, `packages/schema/scripts/generate-${generator}.mjs`,
    (s) => s + "\nawait writeFile(outPath, (await readFile(outPath, 'utf8')) + '\\n// intentional negative probe\\n');\n",
    'pnpm', ['check:generated'], /Generated artifacts differ from HEAD/,
    [`packages/schema/src/generated/${artifact}`]);
}
fails('new generated artifact', 'packages/schema/src/generated/negative-probe.txt', () => 'unexpected', 'node', ['scripts/check-generated.mjs'], /negative-probe.txt/);
fails('failing automated test', 'packages/core/test/negative-probe.test.ts', () => "import { it, expect } from 'vitest'; it('negative probe', () => expect(true).toBe(false));", 'pnpm', ['test'], /expected true to be false/);
fails('TypeScript compilation failure', 'packages/core/src/geometry.ts', (s) => s + '\nconst negativeProbe: number = "wrong";\n', 'pnpm', ['build'], /TS2322/);
for (const [label, violation] of [
  ['node:fs import', "import 'node:fs';"], ['bare builtin', "import 'fs';"],
  ['Node global', 'process.cwd();'], ['core to CLI reverse import', "import '../../../apps/cli/src/index.js';"],
]) fails(label, 'packages/core/src/index.ts', (s) => s + '\n' + violation, 'pnpm', ['check:architecture'], /prohibited|boundary/);
fails('browser-incompatible compiled dependency', 'packages/core/dist/index.js', (s) => s + "\nimport 'node:fs';\n", 'pnpm', ['check:browser'], /Could not resolve "node:fs"/);
fails('compiled CLI smoke failure', 'apps/cli/dist/index.js', () => 'process.exit(1);', 'pnpm', ['test:smoke'], /AssertionError/);
// Restore any emitted files and incremental metadata following the compiler probe.
const rebuilt = run('pnpm', ['build']);
assert.equal(rebuilt.status, 0, rebuilt.stdout + rebuilt.stderr);
console.log('All 11 negative probes detected; temporary source/artifact modifications restored.');
