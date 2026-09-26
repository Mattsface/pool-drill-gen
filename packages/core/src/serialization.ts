// Writing drill documents back to JSON text.
//
// ADR-0006 makes round-trips lossless: a writer must preserve properties it
// does not understand, in place. The representation is what guarantees it,
// not this function. A drill is the parsed JSON object itself — the
// generated Drill type describes its known surface, and the `[k: string]:
// unknown` index signatures json-schema-to-typescript emits for the lenient
// schema describe everything else. Callers edit that object (or a spread
// copy of it) and hand it back here; nothing is ever rebuilt field by field
// from the known type, which is exactly the lossy pattern ADR-0006 forbids.
//
// Reading needs no helper of its own: JSON.parse, then validateDrillSchema
// from @pool-drill-gen/schema to narrow the result to Drill, then
// validateDrill() for meaning.
import type { Drill } from '@pool-drill-gen/schema';

/**
 * Serializes a drill to JSON text: two-space indentation and a trailing
 * newline.
 *
 * Every property on the object is written — known or not, at any depth —
 * in its existing key order. A document read with `JSON.parse` and written
 * back with this function is therefore deeply equal to the original, and
 * differs only in whitespace and in how numbers are spelled (`0.4000`
 * becomes `0.4`).
 *
 * Coordinates are written as held. The 4-decimal quantization of
 * docs/coordinates.md §3.2 is not applied here yet; a document whose
 * coordinates already have at most four decimals is unaffected by that
 * rule either way.
 *
 * Does not mutate its argument.
 */
export function serializeDrill(drill: Drill): string {
  return `${JSON.stringify(drill, null, 2)}\n`;
}
