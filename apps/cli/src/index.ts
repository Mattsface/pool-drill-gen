#!/usr/bin/env node
// Entry point for the `pooldrill` binary.
import { run } from './cli.js';

process.exitCode = await run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
