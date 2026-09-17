// Generates a precompiled, standalone Ajv validator from the canonical
// JSON Schema. Run via `pnpm schema:validator`. Do not hand-edit the output.
//
// Validation is precompiled at generation/build time: application code
// never calls ajv.compile(), it only imports the generated validator
// module produced here.
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../src/schema/drill.schema.json');
const outPath = path.join(__dirname, '../src/generated/drill.validator.js');

const schema = JSON.parse(await readFile(schemaPath, 'utf-8'));

const ajv = new Ajv({
  code: { source: true, esm: true },
  allErrors: true,
});

const validate = ajv.compile(schema);
const moduleCode = standaloneCode(ajv, validate);

// Ajv's standalone output pulls in small runtime helpers (string length,
// deep equality) and hardcodes them as CommonJS `require()` calls even in
// ESM mode, which is a syntax error in an ES module. Hoist each one into a
// real import so the generated module is valid ESM. Nothing here compiles a
// schema at runtime — these are plain functions.
const runtimeImports = new Map();
const esmModuleCode = moduleCode.replace(
  /require\("([^"]+)"\)/g,
  (_match, specifier) => {
    if (!runtimeImports.has(specifier)) {
      runtimeImports.set(specifier, `ajvRuntime${runtimeImports.size}`);
    }
    return runtimeImports.get(specifier);
  },
);

if (/\brequire\s*\(/.test(esmModuleCode)) {
  throw new Error(
    'generate-validator: generated module still contains a require() call; ' +
      'the ESM rewrite above did not cover it.',
  );
}

// Node's ESM resolver needs the file extension that CommonJS `require()`
// left implicit.
const importBlock = [...runtimeImports]
  .map(([specifier, name]) => {
    const resolvable = path.extname(specifier) === '' ? `${specifier}.js` : specifier;
    return `import ${name} from '${resolvable}';`;
  })
  .join('\n');

const banner =
  '/* eslint-disable */\n' +
  '/**\n' +
  ' * AUTO-GENERATED — do not edit by hand.\n' +
  ` * Generated from ${path.relative(path.join(__dirname, '..'), schemaPath)} by \`pnpm schema:validator\`.\n` +
  ' * Precompiled at generation time: application code does not call\n' +
  ' * ajv.compile() and only imports this generated module.\n' +
  ' */\n';

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(
  outPath,
  banner + (importBlock ? importBlock + '\n' : '') + esmModuleCode,
);

console.log(`Wrote ${path.relative(path.join(__dirname, '..'), outPath)}`);
