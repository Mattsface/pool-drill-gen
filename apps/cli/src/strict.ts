// `pooldrill validate --strict`: find properties the format does not
// declare, as authoring-time lint (ADR-0006, rule 3).
//
// The published schema is lenient and stays that way; this module never
// changes what is valid. It walks a parsed document alongside the
// canonical JSON Schema and reports every object key that no applicable
// schema node declares. The known-property set is read from the schema
// itself, so there is no second list to keep in sync.
//
// The walk is read-only: it never adds, removes, or reorders anything in
// the document it is given.
import { drillSchema } from '@pool-drill-gen/schema';

/** One unknown property, located by a JSON Pointer like Ajv's instancePath. */
export interface StrictWarning {
  code: 'UNKNOWN_PROPERTY';
  path: string;
  property: string;
}

/**
 * The subset of a draft-07 schema node this walk interprets. Keywords it
 * does not list only constrain values, never which property names exist.
 */
interface SchemaNode {
  $ref?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, SchemaNode>;
  patternProperties?: Record<string, SchemaNode>;
  additionalProperties?: boolean | SchemaNode;
  items?: SchemaNode | SchemaNode[];
  additionalItems?: boolean | SchemaNode;
  allOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  not?: SchemaNode;
  if?: SchemaNode;
  then?: SchemaNode;
  else?: SchemaNode;
}

type Schema = SchemaNode | boolean;

const root = drillSchema as SchemaNode;

/**
 * Lists the unknown properties in `document`, in document order: a
 * depth-first walk taking keys in the order the parsed object holds them
 * and array elements by index. The same input always yields the same list.
 *
 * Works on any parsed JSON, including documents that fail schema
 * validation, so a typo can be reported alongside the error it caused.
 */
export function findUnknownProperties(document: unknown): StrictWarning[] {
  const warnings: StrictWarning[] = [];
  walk(document, [root], '', warnings);
  return warnings;
}

function walk(value: unknown, schemas: Schema[], path: string, out: StrictWarning[]): void {
  const applicable = schemas.flatMap((schema) => expand(schema, value));

  if (Array.isArray(value)) {
    value.forEach((element, index) => {
      walk(element, applicable.flatMap((s) => itemSchemas(s, index)), `${path}/${index}`, out);
    });
    return;
  }
  if (!isObject(value)) return;

  // Only schema nodes that say something about property names restrict
  // them. With none — `extensions`, say, which is declared as a bare
  // object — every key is permitted and nothing below it is checked.
  const restricting = applicable.filter(restrictsProperties);
  if (restricting.length === 0) return;
  const open = restricting.some(
    (s) => s.additionalProperties === true || isObject(s.additionalProperties),
  );

  for (const key of Object.keys(value)) {
    const childPath = `${path}/${escapePointer(key)}`;
    const childSchemas = restricting.flatMap((s) => propertySchemas(s, key));
    if (childSchemas.length > 0 || open) {
      walk(value[key], childSchemas, childPath, out);
    } else {
      // Reported once; nothing inside an unknown property is checked.
      out.push({ code: 'UNKNOWN_PROPERTY', path: childPath, property: key });
    }
  }
}

/**
 * The schema nodes that apply to `value`: the node itself plus every
 * subschema reached through `$ref`, `allOf`, the `oneOf`/`anyOf` branches
 * the value plausibly takes, and the `if`/`then`/`else` branch it takes.
 */
function expand(schema: Schema, value: unknown): SchemaNode[] {
  if (typeof schema === 'boolean') return [];
  if (schema.$ref !== undefined) return expand(resolve(schema.$ref), value);

  const nodes: SchemaNode[] = [schema];
  for (const sub of schema.allOf ?? []) nodes.push(...expand(sub, value));
  for (const branches of [schema.oneOf, schema.anyOf]) {
    if (branches) for (const sub of selectBranches(branches, value)) nodes.push(...expand(sub, value));
  }
  if (schema.if !== undefined) {
    const taken = plausiblyMatches(schema.if, value) ? schema.then : schema.else;
    if (taken !== undefined) nodes.push(...expand(taken, value));
  }
  return nodes;
}

/**
 * The branches of a `oneOf`/`anyOf` that `value` plausibly belongs to. A
 * placement with `shape: "circle"` takes only the circle branch, so a
 * stray `x` on it is reported rather than excused by the point branch.
 * If no branch fits — the document is malformed there, and Ajv will say
 * so — every branch's properties are accepted, so the lint reports only
 * what no reading of the schema declares.
 */
function selectBranches(branches: Schema[], value: unknown): Schema[] {
  const fitting = branches.filter((branch) => plausiblyMatches(branch, value));
  return fitting.length > 0 ? fitting : branches;
}

/**
 * A shallow, conservative match used only to choose between branches. It
 * checks the keywords that discriminate in practice — type, const, enum,
 * required, the const/enum of declared properties, and not — and assumes
 * a match for everything else. Precise validation is Ajv's job.
 */
function plausiblyMatches(schema: Schema, value: unknown): boolean {
  if (typeof schema === 'boolean') return schema;
  if (schema.$ref !== undefined) return plausiblyMatches(resolve(schema.$ref), value);

  if (schema.type !== undefined && !hasType(value, schema.type)) return false;
  if ('const' in schema && !jsonEqual(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some((option) => jsonEqual(value, option))) return false;
  if (schema.allOf && !schema.allOf.every((sub) => plausiblyMatches(sub, value))) return false;
  if (schema.not !== undefined && plausiblyMatches(schema.not, value)) return false;

  if (isObject(value)) {
    if (schema.required && !schema.required.every((key) => key in value)) return false;
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value && !matchesScalarConstraint(sub, value[key])) return false;
    }
  }
  return true;
}

/** A property's const/enum, the only property-level check worth making here. */
function matchesScalarConstraint(schema: Schema, value: unknown): boolean {
  if (typeof schema === 'boolean') return schema;
  if (schema.$ref !== undefined) return matchesScalarConstraint(resolve(schema.$ref), value);
  if ('const' in schema && !jsonEqual(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some((option) => jsonEqual(value, option))) return false;
  return true;
}

function restrictsProperties(schema: SchemaNode): boolean {
  return (
    schema.properties !== undefined ||
    schema.patternProperties !== undefined ||
    schema.additionalProperties !== undefined
  );
}

/** Every schema that `key` is declared by in this node. */
function propertySchemas(schema: SchemaNode, key: string): Schema[] {
  const found: Schema[] = [];
  const declared = schema.properties?.[key];
  if (declared !== undefined) found.push(declared);
  for (const [pattern, sub] of Object.entries(schema.patternProperties ?? {})) {
    if (new RegExp(pattern, 'u').test(key)) found.push(sub);
  }
  if (found.length === 0 && isObject(schema.additionalProperties)) {
    found.push(schema.additionalProperties);
  }
  return found;
}

function itemSchemas(schema: SchemaNode, index: number): Schema[] {
  const { items, additionalItems } = schema;
  if (items === undefined) return [];
  if (!Array.isArray(items)) return [items];
  if (index < items.length) return [items[index]!];
  return typeof additionalItems === 'object' ? [additionalItems] : [];
}

/** Resolves a local `#/…` reference against the drill schema. */
function resolve(ref: string): Schema {
  if (!ref.startsWith('#')) throw new Error(`Unsupported schema reference: ${ref}`);
  let node: unknown = root;
  for (const token of ref.slice(1).split('/').filter(Boolean)) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    node = isObject(node) ? node[key] : undefined;
  }
  if (node === undefined) throw new Error(`Unresolvable schema reference: ${ref}`);
  return node as Schema;
}

function hasType(value: unknown, type: string | string[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => {
    switch (t) {
      case 'object':
        return isObject(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      case 'integer':
        return Number.isInteger(value);
      default:
        return typeof value === t;
    }
  });
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** RFC 6901 escaping, so a key containing `/` or `~` still has one path. */
function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}
