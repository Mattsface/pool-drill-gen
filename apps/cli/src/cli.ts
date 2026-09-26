// Command registration for `pooldrill`.
//
// run() takes its arguments and output streams as parameters and returns
// the exit status instead of calling process.exit(), so the whole command
// — parsing, validation, and output — can be driven in-process by tests.
import { Command, CommanderError } from 'commander';
import { formatValidateOutcome, validateFile } from './validate.js';

/** Where the CLI writes. The entry point passes process.stdout/stderr. */
export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * Runs `pooldrill` with the given user arguments (argv without the node
 * binary and script path) and resolves to the process exit status.
 */
export async function run(args: readonly string[], io: CliIO): Promise<number> {
  let exitCode = 0;

  const program = new Command('pooldrill')
    .description('Validate pool drill documents.')
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr })
    .exitOverride();

  program
    .command('validate')
    .description('Check a drill file against the format schema and semantic rules.')
    .argument('<drill.json>', 'path to the drill document')
    .action(async (path: string) => {
      const report = formatValidateOutcome(path, await validateFile(path));
      if (report.stdout) io.stdout(report.stdout);
      if (report.stderr) io.stderr(report.stderr);
      exitCode = report.exitCode;
    });

  try {
    await program.parseAsync([...args], { from: 'user' });
  } catch (error) {
    // Help, version, and usage errors: Commander has already written its
    // output and carries the status it would have exited with.
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }
  return exitCode;
}
