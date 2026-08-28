// Generates TypeScript types from the canonical JSON Schema.
// Run via `pnpm schema:types`. Do not hand-edit the output.
import { compile } from 'json-schema-to-typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../src/schema/drill.schema.json');
const outPath = path.join(__dirname, '../src/generated/drill.ts');

const schema = JSON.parse(await readFile(schemaPath, 'utf-8'));

const output = await compile(schema, 'DrillPlaceholder', {
  bannerComment:
    '/* eslint-disable */\n' +
    '/**\n' +
    ' * AUTO-GENERATED — do not edit by hand.\n' +
    ` * Generated from ${path.relative(path.join(__dirname, '..'), schemaPath)} by \`pnpm schema:types\`.\n` +
    ' */',
  style: { singleQuote: true },
  $refOptions: { resolve: { http: false } },
});

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, output);

console.log(`Wrote ${path.relative(path.join(__dirname, '..'), outPath)}`);
