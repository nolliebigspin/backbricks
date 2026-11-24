import {
  brickAvailability,
  bricks,
  faq,
  links,
  site,
  siteUrl,
  upcomingBricks,
} from '../content/site.ts';

/**
 * `/llms.txt` (llmstxt.org): a Markdown summary for language models and answer engines, built
 * from the same data as the landing page so the two can't drift apart.
 */
export function llmsTxt(): string {
  return [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    `${site.tagline} Integrate through plain HTML forms, the TypeScript SDK, the REST API (OpenAPI), the CLI with config-as-code or the MCP server for AI coding agents. The server is AGPL-3.0; the SDK and CLI you embed in a website are MIT. Backbricks is headless: it ships no widgets, iframes or CSS.`,
    '',
    `Status: ${site.status}. APIs may change until 1.0.`,
    '',
    '## Bricks',
    '',
    ...bricks.map(
      (brick) =>
        `- **${brick.name}** (${brickAvailability}). For the website: ${brick.forWebsite} For the site owner: ${brick.forOwner}`,
    ),
    `- Candidates after 1.0: ${upcomingBricks.join(', ')}.`,
    '',
    '## FAQ',
    '',
    ...faq.flatMap((item) => [`### ${item.question}`, '', item.answer, '']),
    '## Project',
    '',
    `- [Documentation](${siteUrl}/docs): quickstarts and CLI setup`,
    `- [API reference](${siteUrl}/docs/api): OpenAPI operations and schema`,
    `- [API errors](${siteUrl}/docs/errors): problem codes and troubleshooting`,
    `- [Self-hosting](${siteUrl}/docs/self-host): local and production Compose setup`,
    `- [Full documentation for agents](${siteUrl}/llms-full.txt): expanded Markdown guides`,
    `- [Source code](${links.repo}): repository, README and issues`,
    `- [Architecture](${links.architecture}): decisions, data model, API, SDK and CLI`,
    `- [Roadmap](${links.roadmap}): milestones up to the open-source 1.0`,
    `- [Modules](${links.modules}): candidate modules after 1.0`,
    `- [Licensing](${links.licensing}): AGPL server, MIT SDK and CLI`,
    '',
  ].join('\n');
}
