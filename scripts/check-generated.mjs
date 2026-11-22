import { execFileSync } from 'node:child_process';

// Both generators write here. Compare the entire directory to HEAD, not just
// the two known filenames, so additions/deletions (including ignored files) fail.
export function assertGeneratedClean() {
  const directory = 'packages/schema/src/generated';
  const changed = execFileSync('git', ['diff', 'HEAD', '--name-status', '--', directory], {
    encoding: 'utf8',
  });
  const added = execFileSync('git', ['ls-files', '--others', '--', directory], {
    encoding: 'utf8',
  });
  if (changed || added) {
    console.error(changed + added);
    execFileSync('git', ['diff', 'HEAD', '--', directory], { stdio: 'inherit' });
    throw new Error(
      'Generated artifacts differ from HEAD. Run pnpm schema:generate and commit the resulting artifacts.',
    );
  }
  console.log('Generated artifacts match HEAD.');
}
assertGeneratedClean();
