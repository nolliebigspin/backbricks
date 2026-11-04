import { describe, expect, test } from 'bun:test';

import { checkCommitMessage } from './check-commit-msg.ts';

const SIGN_OFF = 'Signed-off-by: Jane Doe <jane@example.com>';

describe('checkCommitMessage', () => {
  test('accepts a signed-off Conventional Commit', () => {
    expect(
      checkCommitMessage(`feat(forms): add honeypot field [P2.4]\n\nBody.\n\n${SIGN_OFF}\n`),
    ).toEqual([]);
  });

  test('accepts a type without scope and a breaking-change marker', () => {
    expect(checkCommitMessage(`chore!: drop Node 18\n\n${SIGN_OFF}`)).toEqual([]);
  });

  test('rejects a missing sign-off', () => {
    const problems = checkCommitMessage('fix(uploads): reject empty files');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Signed-off-by');
  });

  test('ignores a sign-off that only appears in a git comment line', () => {
    expect(checkCommitMessage(`docs: typo\n# ${SIGN_OFF}`)).toHaveLength(1);
  });

  test('rejects a subject that is not a Conventional Commit', () => {
    const problems = checkCommitMessage(`Update stuff\n\n${SIGN_OFF}`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Conventional Commit');
  });

  test('rejects an unknown type', () => {
    expect(checkCommitMessage(`feature: x\n\n${SIGN_OFF}`)).toHaveLength(1);
  });

  test('accepts merge commits without a sign-off', () => {
    expect(checkCommitMessage("Merge branch 'main' into feat/x")).toEqual([]);
  });

  test('accepts git-generated fixup subjects when signed off', () => {
    expect(checkCommitMessage(`fixup! feat(forms): add honeypot\n\n${SIGN_OFF}`)).toEqual([]);
  });
});
