// Positive cases: what format 0.1 accepts.
import { describe, it } from 'vitest';
import { expectValid } from './helpers/validate.js';
import { drillWith, minimalDrill, representativeDrill, withShot } from './helpers/drills.js';

describe('valid documents', () => {
  it('accepts a minimal drill carrying only required fields', () => {
    expectValid(minimalDrill());
  });

  it('accepts a representative drill with optional metadata and every placement form', () => {
    expectValid(representativeDrill());
  });

  it('accepts each optional top-level field individually', () => {
    expectValid(drillWith({ description: 'Prose about the drill.' }));
    expectValid(drillWith({ game: '8-ball' }));
    expectValid(drillWith({ skills: ['draw', 'position'] }));
    expectValid(drillWith({ skills: [] }));
    expectValid(drillWith({ difficulty: 2 }));
    expectValid(drillWith({ tags: ['warm-up'] }));
    expectValid(drillWith({ extensions: {} }));
    expectValid(drillWith({ extensions: { 'com.example.app': { anything: [1, 2, 3] } } }));
  });

  it('accepts each optional ball and shot field', () => {
    expectValid(withShot({ note: 'Slow roll.' }));
    expectValid(
      withShot({
        cueBallTarget: { shape: 'circle', center: { x: 0.4, y: 0.25 }, radius: 0.05 },
      }),
    );
  });

  it('accepts all three sequencing modes', () => {
    for (const sequencing of ['strict', 'any_order', 'single_shot']) {
      expectValid(drillWith({ sequencing }));
    }
  });

  it('accepts an optional provenance record beyond createdAt', () => {
    expectValid(
      drillWith({
        provenance: {
          author: 'Someone',
          createdAt: '2026-01-01T00:00:00Z',
          derivedFrom: 'parent-drill',
          license: 'All rights reserved',
        },
      }),
    );
  });
});
