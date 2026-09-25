import { describe, expect, it } from 'vitest';
import { validateDrillSchema, type Drill } from '@pool-drill-gen/schema';
import { validateDrill } from '../src/index.js';

// Vite reads these plain JSON files as text in the test environment. Core's
// production sources remain independent of file I/O and Node built-ins.
const fixtureTexts = import.meta.glob('./fixtures/*.pooldrill.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fixtureNames = [
  'stop-shot-repetition.pooldrill.json',
  'three-ball-position-route.pooldrill.json',
  'ball-in-hand-kitchen.pooldrill.json',
  'any-order-potting.pooldrill.json',
  'obstacle-ball-drill.pooldrill.json',
];

describe('representative format 0.1 fixture drills', () => {
  it('contains exactly the five M1.9 JSON fixtures', () => {
    expect(Object.keys(fixtureTexts).sort()).toEqual(
      fixtureNames.map((name) => `./fixtures/${name}`).sort(),
    );
  });

  it.each(fixtureNames)('%s parses and passes both public validators', (name) => {
    const source = fixtureTexts[`./fixtures/${name}`];
    expect(source, `Fixture ${name} could not be loaded`).toBeDefined();

    let document: unknown;
    try {
      document = JSON.parse(source);
    } catch (error) {
      throw new Error(`Fixture ${name} is not valid JSON: ${String(error)}`);
    }

    const schemaValid = validateDrillSchema(document);
    const schemaErrors = (validateDrillSchema as typeof validateDrillSchema & {
      errors?: unknown[] | null;
    }).errors;
    expect(schemaValid, `Schema errors in ${name}: ${JSON.stringify(schemaErrors)}`).toBe(true);

    if (!schemaValid) return;
    const semanticResult = validateDrill(document as Drill);
    expect(semanticResult.issues, `Semantic issues in ${name}`).toEqual([]);
    expect(semanticResult.valid, `Semantic validation failed for ${name}`).toBe(true);
  });
});
