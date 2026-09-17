// Behaviour settled during the M1.3 schema review.
//
// Each of these is a decision about what format 0.1 deliberately does NOT
// constrain. They are easy to "tidy up" later by adding a bound or a
// minLength, which would be a breaking format change dressed as a cleanup.
// This file is the tripwire.
import { describe, it } from 'vitest';
import { expectErrorMatching, expectInvalid, expectValid } from './helpers/validate.js';
import { drillWith, withObjectBall, withShot } from './helpers/drills.js';

describe('empty strings are not rejected merely for being empty', () => {
  it('accepts an empty drill id and title', () => {
    expectValid(drillWith({ id: '', title: '' }));
  });

  it('accepts empty optional prose fields', () => {
    expectValid(drillWith({ description: '', game: '' }));
  });

  it('accepts an empty tableSize label', () => {
    expectValid(
      drillWith({
        authoredFor: {
          tableSize: '',
          playingSurface: { lengthIn: 100, widthIn: 50 },
          ballSet: { ballDiameterIn: 2.25 },
        },
      }),
    );
  });

  it('accepts an empty ball id and label', () => {
    expectValid(withObjectBall({ id: '', label: '' }));
  });

  it('accepts an empty shot ballId and note', () => {
    expectValid(withShot({ ballId: '', note: '' }));
  });

  it('accepts empty provenance strings', () => {
    expectValid(
      drillWith({
        provenance: { createdAt: '2026-08-28T14:00:00Z', author: '', derivedFrom: '', license: '' },
      }),
    );
  });

  it('accepts empty entries in skills and tags', () => {
    expectValid(drillWith({ skills: [''], tags: [''] }));
  });
});

describe('difficulty has no 0.1 scale, bounds, or direction', () => {
  it.each([[0], [1], [5], [10], [11], [100], [-17.5], [2.5], [1e6]])(
    'accepts difficulty %o',
    (difficulty) => {
      expectValid(drillWith({ difficulty }));
    },
  );

  it('still requires difficulty to be a number when present', () => {
    expectErrorMatching(expectInvalid(drillWith({ difficulty: 'hard' })), {
      keyword: 'type',
      instancePath: '/difficulty',
    });
  });
});

describe('balls[].number is an unbounded integer', () => {
  it.each([[0], [1], [8], [15], [-3], [999]])('accepts ball number %o', (number) => {
    expectValid(withObjectBall({ number }));
  });

  it('still requires an integer', () => {
    expectErrorMatching(expectInvalid(withObjectBall({ number: 8.5 })), {
      keyword: 'type',
      instancePath: '/balls/1/number',
    });
  });
});

describe('unknown properties remain accepted', () => {
  // Covered thoroughly in leniency.test.ts; restated here because the M1.3
  // review settled it explicitly and a regression would be a silent
  // breaking change.
  it('accepts an unknown property on every level of the minimal drill', () => {
    expectValid(drillWith({ somethingNew: true }));
    expectValid(withObjectBall({ somethingNew: true }));
    expectValid(withShot({ somethingNew: true }));
  });
});
