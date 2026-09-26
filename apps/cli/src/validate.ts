// `pooldrill validate <drill.json>`: read a file, check it, and report.
//
// The CLI owns only the file read, the JSON parse, and the presentation.
// Shape rules belong to the precompiled validator in @pool-drill-gen/schema
// and meaning rules to validateDrill() in @pool-drill-gen/core; this module
// calls them in that order and never re-checks anything itself.
import { readFile } from 'node:fs/promises';
import { validateDrillSchema, type Drill } from '@pool-drill-gen/schema';
import { validateDrill, type ValidationIssue } from '@pool-drill-gen/core';

/**
 * One shape error, narrowed to the parts of an Ajv error object the CLI
 * prints. The generated validator is JavaScript, so its declaration does
 * not describe the `errors` property Ajv attaches; this is that description.
 */
export interface SchemaError {
  keyword: string;
  instancePath: string;
  params: Record<string, unknown>;
  message?: string;
}

const schemaValidator = validateDrillSchema as typeof validateDrillSchema & {
  errors?: SchemaError[] | null;
};

/**
 * What happened to one file. Each failure is its own kind so the four
 * categories — unreadable file, invalid JSON, wrong shape, wrong meaning —
 * stay distinguishable all the way to the output.
 */
export type ValidateOutcome =
  | { kind: 'valid'; drill: Drill }
  | { kind: 'read-error'; detail: string }
  | { kind: 'invalid-json'; detail: string }
  | { kind: 'schema-invalid'; errors: SchemaError[] }
  | { kind: 'semantic-invalid'; issues: ValidationIssue[] };

/**
 * Runs the validation pipeline over one file: read, parse, shape, meaning.
 * Each stage runs only if the one before it passed.
 */
export async function validateFile(path: string): Promise<ValidateOutcome> {
  let text: string;
  try {
    text = await readFile(path, 'utf-8');
  } catch (error) {
    return { kind: 'read-error', detail: errorDetail(error) };
  }

  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return { kind: 'invalid-json', detail: errorDetail(error) };
  }

  if (!schemaValidator(document)) {
    return { kind: 'schema-invalid', errors: [...(schemaValidator.errors ?? [])] };
  }

  const drill = document as Drill;
  const result = validateDrill(drill);
  if (!result.valid) {
    return { kind: 'semantic-invalid', issues: result.issues };
  }
  return { kind: 'valid', drill };
}

/** Text for the terminal and the process exit status for one outcome. */
export interface ValidateReport {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Formats an outcome for a person. Success goes to stdout; every failure
 * goes to stderr, headed by a line naming its category and the file.
 *
 * Exit status is 0 for a valid drill and 1 for any failure. The category
 * is carried by the output, not by the number.
 */
export function formatValidateOutcome(path: string, outcome: ValidateOutcome): ValidateReport {
  switch (outcome.kind) {
    case 'valid':
      return { stdout: `Valid drill: ${outcome.drill.title}\n`, stderr: '', exitCode: 0 };

    case 'read-error':
      return failure([`Cannot read file: ${path}`, `  ${outcome.detail}`]);

    case 'invalid-json':
      return failure([`Invalid JSON: ${path}`, `  ${outcome.detail}`]);

    case 'schema-invalid':
      return failure([
        `Schema validation failed: ${path} (${count(outcome.errors.length, 'error')})`,
        ...outcome.errors.map(formatSchemaError),
      ]);

    case 'semantic-invalid':
      return failure([
        `Semantic validation failed: ${path} (${count(outcome.issues.length, 'issue')})`,
        ...outcome.issues.flatMap(formatIssue),
      ]);
  }
}

function failure(lines: string[]): ValidateReport {
  return { stdout: '', stderr: `${lines.join('\n')}\n`, exitCode: 1 };
}

/** `  /balls/0/role: must be equal to one of the allowed values (cue, object, obstacle)` */
function formatSchemaError(error: SchemaError): string {
  const where = error.instancePath === '' ? '(root)' : error.instancePath;
  const message = error.message ?? error.keyword;
  const allowed = error.params.allowedValues;
  const suffix = Array.isArray(allowed) ? ` (${allowed.map(String).join(', ')})` : '';
  return `  ${where}: ${message}${suffix}`;
}

/**
 * ```
 *   BALL_OVERLAP at balls[0], balls[1]
 *     Balls "a" and "b" overlap …
 * ```
 * An issue with no paths — such as a drill with no cue ball — prints its
 * code alone.
 */
function formatIssue(issue: ValidationIssue): string[] {
  const where = issue.paths.length > 0 ? ` at ${issue.paths.join(', ')}` : '';
  return [`  ${issue.code}${where}`, `    ${issue.message}`];
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** The message of a thrown value, without its stack. */
function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
