#!/usr/bin/env bun
/**
 * Creates or updates GitHub milestones from `.github/milestones.json` (single source of truth).
 * Idempotent: existing milestones (matched by title) get their description updated.
 *
 * Usage: bun scripts/github/sync-milestones.ts [owner/repo]
 * Requires: authenticated GitHub CLI (`gh auth login`).
 */
import { $ } from 'bun';

import milestones from '../../.github/milestones.json';

type Milestone = { title: string; description: string };

const repo =
  process.argv[2] ?? (await $`gh repo view --json nameWithOwner -q .nameWithOwner`.text()).trim();

if (!repo) {
  console.error('Could not determine the repository. Pass it explicitly: owner/repo');
  process.exit(1);
}

const existingOutput =
  await $`gh api repos/${repo}/milestones?state=all --paginate --jq ${'.[] | [.number, .title] | @tsv'}`.text();

const existing = new Map<string, number>(
  existingOutput
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [number, ...title] = line.split('\t');
      return [title.join('\t'), Number(number)] as const;
    }),
);

// Sequential on purpose: creating milestones in file order keeps their GitHub numbers ordered.
for (const { title, description } of milestones as Milestone[]) {
  const number = existing.get(title);
  if (number === undefined) {
    // oxlint-disable-next-line no-await-in-loop
    await $`gh api repos/${repo}/milestones -f title=${title} -f description=${description} -f state=open --silent`;
    console.log(`created  ${title}`);
  } else {
    // oxlint-disable-next-line no-await-in-loop
    await $`gh api -X PATCH repos/${repo}/milestones/${number} -f description=${description} --silent`;
    console.log(`updated  ${title}`);
  }
}
