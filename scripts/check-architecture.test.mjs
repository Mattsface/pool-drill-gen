import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkArchitecture } from './check-architecture.mjs';

function check(source, layer = 'core', dependencies = {}) {
  const root = mkdtempSync(join(tmpdir(), 'architecture-'));
  try {
    for (const name of ['schema', 'core', 'cli']) {
      const dir = `${name === 'cli' ? 'apps' : 'packages'}/${name}`;
      mkdirSync(join(root, dir, 'src'), { recursive: true });
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ name: `@pool-drill-gen/${name}`, dependencies: name === layer ? dependencies : {} }));
      writeFileSync(join(root, dir, 'src/index.ts'), name === layer ? source : 'export {};');
    }
    return checkArchitecture(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
for (const source of [
  "import 'node:fs';", "export * from 'fs';", "import('node:fs/promises');",
  "require('path');", "import fs = require('fs');", 'process.cwd();', 'Buffer.from([]);',
  'const x = {process};', 'globalThis["process"];', 'ajv.compile({});', '__dirname;', '__filename;', 'globalThis.process;', 'document.createElement("div");',
  'window.location;', 'const x: HTMLElement = null!;', "import '@cloudflare/workers-types';",
  "import '@pool-drill-gen/cli';", "import '../../../apps/cli/src/index.js';",
  'import(moduleName);', "import Ajv from 'ajv'; new Ajv().compile({});",
]) test(`rejects ${source}`, () => assert(check(source).length > 0));
test('ignores comments, strings, property names and locally bound names', () => {
  assert.deepEqual(check(`// process.cwd(); import 'fs';
    const text = "Buffer node:fs";
    function f(process: {value: number}, Buffer: number) { return process.value + Buffer; }
    const x = { process: 1, document: 'ok' }; x.process;
    export { f, x, text };`), []);
});
test('permits core consumption of schema and relative modules', () => assert.deepEqual(check("import type { Drill } from '@pool-drill-gen/schema'; export * from './geometry.js';"), []));
test('rejects schema reverse import', () => assert(check("export * from '@pool-drill-gen/core';", 'schema').length > 0));
test('rejects reverse manifest dependencies even without imports', () => assert(check('export {};', 'core', { '@pool-drill-gen/cli': 'workspace:*' }).length > 0));
test('rejects runtime Ajv compiler manifest dependency', () => assert(check('export {};', 'schema', { ajv: '^8' }).length > 0));
test('permits CLI platform APIs and downstream packages', () => assert.deepEqual(check("import 'node:fs'; import '@pool-drill-gen/core'; import '@pool-drill-gen/schema'; process.cwd();", 'cli'), []));
