import { Section } from './section.tsx';

const steps = [
  {
    title: 'Set up the project',
    text: 'Create a project in the dashboard, add your website origin, and choose the bricks you need. Use the CLI or MCP to manage the setup as code.',
  },
  {
    title: 'Connect your website',
    text: 'Use a plain HTML form, the TypeScript SDK, or the REST API. Start with a publishable key and submit a test entry from your site.',
  },
  {
    title: 'Work from the dashboard',
    text: 'Site owners track entries, download private attachments, and choose which reviews to publish. Scoped CLI credentials support the same workflows in scripts.',
  },
] as const;

const cliCommands = [
  'npx backbricks validate',
  'npx backbricks diff',
  'npx backbricks push --yes',
  'npx backbricks codegen',
  'npx backbricks doctor --origin https://www.example.com',
] as const;

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      tone="mortar"
      title="From website to dashboard"
      intro="Connect your site once. Keep the integration in your code and give site owners a workspace for the day-to-day."
    >
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <ol className="space-y-8">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-5">
              <span
                aria-hidden="true"
                className="w-6 shrink-0 font-heading text-3xl leading-none font-bold text-brand tabular-nums"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-1 text-pretty text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <figure className="min-w-0 self-start">
          <pre className="code-block" aria-label="CLI workflow">
            <code>
              {cliCommands.map((command) => (
                <span key={command} className="block">
                  <span aria-hidden="true" className="token keyword select-none">
                    ${' '}
                  </span>
                  {command}
                </span>
              ))}
            </code>
          </pre>
          <figcaption className="mt-3 text-sm text-muted-foreground">
            Preview changes, apply them, and check your integration from a linked project.{' '}
            <a href="/docs/cli" className="text-brand underline underline-offset-4">
              CLI and MCP guide
            </a>
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
