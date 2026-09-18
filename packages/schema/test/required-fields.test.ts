// Required fields, at the document root and inside the nested objects that
// declare their own `required` list.
import { describe, expect, it } from 'vitest';
import { expectErrorMatching, expectInvalid, validate } from './helpers/validate.js';
import { drillWith, drillWithout, minimalDrill, omit } from './helpers/drills.js';

const REQUIRED_TOP_LEVEL = [
  'format',
  'formatVersion',
  'id',
  'title',
  'authoredFor',
  'balls',
  'sequencing',
  'shots',
  'success',
  'provenance',
] as const;

describe('required fields', () => {
  it.each(REQUIRED_TOP_LEVEL)('rejects a document missing %s', (key) => {
    const errors = expectInvalid(drillWithout(key));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '',
      missingProperty: key,
    });
  });

  it('reports every missing required field at once', () => {
    const { valid, errors } = validate({});
    expect(valid).toBe(false);
    const missing = errors
      .filter((e) => e.keyword === 'required' && e.instancePath === '')
      .map((e) => e.params.missingProperty);
    expect(new Set(missing)).toEqual(new Set(REQUIRED_TOP_LEVEL));
  });

  it('rejects an empty document and a non-object document', () => {
    expectInvalid({});
    expectInvalid(null);
    expectInvalid([minimalDrill()]);
    expectInvalid('a drill');
  });

  it.each(['tableSize', 'playingSurface', 'ballSet'])(
    'rejects authoredFor missing %s',
    (key) => {
      const authoredFor = omit(minimalDrill().authoredFor as unknown as Record<string, unknown>, key);
      const errors = expectInvalid(drillWith({ authoredFor }));
      expectErrorMatching(errors, {
        keyword: 'required',
        instancePath: '/authoredFor',
        missingProperty: key,
      });
    },
  );

  it.each(['lengthIn', 'widthIn'])('rejects playingSurface missing %s', (key) => {
    const authoredFor = minimalDrill().authoredFor as unknown as Record<string, unknown>;
    const errors = expectInvalid(
      drillWith({
        authoredFor: {
          ...authoredFor,
          playingSurface: omit(authoredFor.playingSurface as Record<string, unknown>, key),
        },
      }),
    );
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/authoredFor/playingSurface',
      missingProperty: key,
    });
  });

  it('rejects ballSet missing ballDiameterIn', () => {
    const authoredFor = minimalDrill().authoredFor as unknown as Record<string, unknown>;
    const errors = expectInvalid(
      drillWith({ authoredFor: { ...authoredFor, ballSet: {} } }),
    );
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/authoredFor/ballSet',
      missingProperty: 'ballDiameterIn',
    });
  });

  it('rejects provenance missing createdAt', () => {
    const errors = expectInvalid(drillWith({ provenance: { author: 'Someone' } }));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/provenance',
      missingProperty: 'createdAt',
    });
  });

  it.each(['id', 'role', 'at'])('rejects a ball missing %s', (key) => {
    const doc = minimalDrill() as unknown as Record<string, unknown>;
    const balls = (doc.balls as Record<string, unknown>[]).slice();
    balls[1] = omit(balls[1], key);
    const errors = expectInvalid(drillWith({ balls }));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/balls/1',
      missingProperty: key,
    });
  });

  it.each(['n', 'type', 'ballId'])('rejects a shot missing %s', (key) => {
    const shot = omit(
      (minimalDrill().shots as unknown as Record<string, unknown>[])[0],
      key,
    );
    const errors = expectInvalid(drillWith({ shots: [shot] }));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/shots/0',
      missingProperty: key,
    });
  });

  it('rejects success missing mode', () => {
    const errors = expectInvalid(drillWith({ success: {} }));
    expectErrorMatching(errors, {
      keyword: 'required',
      instancePath: '/success',
      missingProperty: 'mode',
    });
  });

  it('rejects empty balls and shots arrays', () => {
    expectErrorMatching(expectInvalid(drillWith({ balls: [] })), {
      keyword: 'minItems',
      instancePath: '/balls',
    });
    expectErrorMatching(expectInvalid(drillWith({ shots: [] })), {
      keyword: 'minItems',
      instancePath: '/shots',
    });
  });
});
