import { brickStatusLabel, bricks, faq, links, site, upcomingBricks } from '../content/site.ts';

/**
 * `/llms.txt` (llmstxt.org): a Markdown summary for language models and answer engines, built
 * from the same data as the landing page so the two can't drift apart. M5 (P5.7) adds the docs
 * links and `llms-full.txt`.
 */
export function llmsTxt(): string {
  const status = bricks
    .map((brick) => `${brick.name} ${brickStatusLabel(brick).toLowerCase()}`)
    .join('; ');

  return [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    `${site.tagline} Integrate through plain HTML forms, the TypeScript SDK, the REST API (OpenAPI), the CLI with config-as-code or the MCP server for AI coding agents. The server is AGPL-3.0; the SDK and CLI you embed in a website are MIT. Backbricks is headless: it ships no widgets, iframes or CSS.`,
    '',
    `Status: ${site.status}. ${status}. APIs may change until 1.0.`,
    '',
    '## Bricks',
    '',
    ...bricks.map(
      (brick) =>
        `- **${brick.name}** (${brickStatusLabel(brick)}). For the website: ${brick.forWebsite} For the site owner: ${brick.forOwner}`,
    ),
    `- Candidates after 1.0: ${upcomingBricks.join(', ')}.`,
    '',
    '## FAQ',
    '',
    ...faq.flatMap((item) => [`### ${item.question}`, '', item.answer, '']),
    '## Project',
    '',
    `- [Source code](${links.repo}): repository, README and issues`,
    `- [Architecture](${links.architecture}): decisions, data model, API, SDK and CLI`,
    `- [Roadmap](${links.roadmap}): milestones up to the open-source 1.0`,
    `- [Modules](${links.modules}): candidate modules after 1.0`,
    `- [Licensing](${links.licensing}): AGPL server, MIT SDK and CLI`,
    '',
  ].join('\n');
}
