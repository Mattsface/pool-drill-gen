// `pooldrill show <drill.json>`: validate a file, then summarise it.
//
// The file goes through the same validateFile() pipeline as `validate`, and
// any failure is reported by the same formatter, so the two commands can
// never disagree about what is valid or describe a failure differently.
// Only a valid drill is summarised; nothing here re-checks the model.
//
// The summary reads the authored values as they are. It derives nothing —
// no geometry from the table-size label, no game, no scoring rule — and
// prints no extension or unknown data.
import type { Drill } from '@pool-drill-gen/schema';
import {
  formatValidateResult,
  validateFile,
  type ValidateReport,
} from './validate.js';

/** Validates the file and, if it is valid, summarises it on stdout. */
export async function showFile(path: string): Promise<ValidateReport> {
  const result = await validateFile(path);
  if (result.outcome.kind !== 'valid') return formatValidateResult(path, result);
  return { stdout: formatDrillSummary(result.outcome.drill), stderr: '', exitCode: 0 };
}

/**
 * ```
 * Three-ball alternating-corner route
 * Format:      0.1
 * Game:        9-ball
 * Table:       9ft
 * Sequencing:  strict
 * Balls:       4
 * Shots:       3
 * Success:     run_all
 * ```
 * The Game line appears only when the drill names a game.
 */
export function formatDrillSummary(drill: Drill): string {
  const fields: [string, string][] = [
    ['Format', drill.formatVersion],
    ...(drill.game !== undefined ? [['Game', drill.game] as [string, string]] : []),
    ['Table', drill.authoredFor.tableSize],
    ['Sequencing', drill.sequencing],
    ['Balls', String(drill.balls.length)],
    ['Shots', String(drill.shots.length)],
    ['Success', formatSuccess(drill.success)],
  ];
  const lines = [drill.title, ...fields.map(([label, value]) => `${`${label}:`.padEnd(13)}${value}`)];
  return `${lines.join('\n')}\n`;
}

/** `run_all`, or `count (7 of 10 attempts)`. */
function formatSuccess(success: Drill['success']): string {
  if (success.mode === 'count') {
    return `count (${success.target} of ${success.attempts} attempts)`;
  }
  return success.mode;
}
