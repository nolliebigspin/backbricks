#!/usr/bin/env bun
/**
 * `commit-msg` hook (lefthook): rejects commits without a DCO sign-off or a Conventional
 * Commits subject. CI checks the sign-off again; this catches it before a rebase is needed.
 *
 * Usage: bun scripts/git/check-commit-msg.ts <path-to-commit-message-file>
 */

const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'chore',
  'refactor',
  'test',
  'build',
  'ci',
  'perf',
  'style',
  'revert',
] as const;

const SUBJECT_PATTERN = new RegExp(`^(${CONVENTIONAL_TYPES.join('|')})(\\([a-z0-9-]+\\))?!?: \\S`);
// Same pattern as the DCO job in .github/workflows/ci.yml.
const SIGN_OFF_PATTERN = /^Signed-off-by: .+ <.+>$/m;
// Messages git generates itself; CI skips merge commits, fixups get squashed before merging.
const GENERATED_SUBJECT_PATTERN = /^(Merge |Revert "|fixup! |squash! |amend! )/;

/** Returns the problems with a commit message; an empty list means it is valid. */
export function checkCommitMessage(rawMessage: string): string[] {
  const message = rawMessage
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
  const subject = message.split('\n', 1)[0] ?? '';

  if (subject.startsWith('Merge ')) return [];

  const problems: string[] = [];
  if (!GENERATED_SUBJECT_PATTERN.test(subject) && !SUBJECT_PATTERN.test(subject)) {
    problems.push(
      `Subject "${subject}" is not a Conventional Commit, e.g. "feat(forms): add honeypot field [P2.4]". ` +
        `Allowed types: ${CONVENTIONAL_TYPES.join(', ')}.`,
    );
  }
  if (!SIGN_OFF_PATTERN.test(message)) {
    problems.push(
      'Missing "Signed-off-by" line. Commit with `git commit -s` (see CONTRIBUTING.md, DCO).',
    );
  }
  return problems;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: bun scripts/git/check-commit-msg.ts <commit-message-file>');
    process.exit(2);
  }
  const problems = checkCommitMessage(await Bun.file(file).text());
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✖ ${problem}`);
    process.exit(1);
  }
}
