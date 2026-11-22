import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const drill = JSON.parse(
  readFileSync('packages/core/test/fixtures/stop-shot-repetition.pooldrill.json', 'utf8'),
);
const result = await build({
  stdin: {
    contents: `
      import { validateDrill, migrate, distance, fromDiamonds, toDiamonds, ballRadius, surfaceRatio } from './packages/core/dist/index.js';
      import { validateDrillSchema, drillSchema } from './packages/schema/dist/index.js';
      const drill = ${JSON.stringify(drill)};
      const surface = drill.authoredFor.playingSurface;
      globalThis.bundleResult = {
        valid: validateDrill(drill).valid,
        migrated: migrate(drill).document === drill,
        shape: validateDrillSchema(drill), invalidShape: validateDrillSchema({}),
        schema: drillSchema.properties.formatVersion.const,
        distance: distance({x: 0, y: 0}, {x: 3, y: 4}),
        ratio: surfaceRatio(surface), radius: ballRadius(surface, drill.authoredFor.ballSet),
        diamonds: toDiamonds(fromDiamonds({dx: 2, dy: 1}, surface), surface)
      };`,
    resolveDir: process.cwd(),
    sourcefile: 'browser-probe.js',
  },
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  write: false,
  metafile: true,
});
const inputs = Object.keys(result.metafile.inputs);
assert(
  inputs.some((p) => p.endsWith('core/dist/index.js')),
  'compiled core entry missing',
);
assert(
  inputs.some((p) => p.endsWith('generated/drill.validator.js')),
  'standalone validator missing',
);
assert(
  !inputs.some((p) =>
    /node_modules\/(?:\.pnpm\/)?(?:ajv|json-schema-to-typescript)(?:@|\/)/.test(p),
  ),
  'runtime schema compiler bundled',
);
// Execute the self-contained probe with no Node APIs or DOM. This is additional
// evidence, not a full browser/Worker runtime emulator.
const context = {};
runInNewContext(result.outputFiles[0].text, context, {
  timeout: 5000,
  contextCodeGeneration: { strings: false, wasm: false },
});
const value = JSON.parse(JSON.stringify(context.bundleResult));
assert.deepEqual(value, {
  valid: true,
  migrated: true,
  shape: true,
  invalidShape: false,
  schema: '0.1',
  distance: 5,
  ratio: 0.5,
  radius: 0.01125,
  diamonds: { dx: 2, dy: 1 },
});
console.log(
  `Browser ES2022 bundle passed: ${inputs.length} inputs, ${result.outputFiles[0].contents.length} bytes; public API probe passed without Node/DOM or runtime code generation.`,
);
