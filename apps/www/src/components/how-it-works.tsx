import { Section } from './section.tsx';

const steps = [
  {
    title: 'Your agent connects',
    text: 'Claude Code, Codex or any MCP-capable agent reads the integration guide, defines forms and upload areas as config-as-code and wires them into your site.',
  },
  {
    title: 'Your site keeps its look',
    text: 'Backbricks is headless: no widgets, iframes or CSS. Use plain HTML forms, the TypeScript SDK or the REST API from any framework.',
  },
  {
    title: 'Owners run the rest',
    text: 'Entries, files and reviews land in a dashboard written for non-technical people, with notifications, exports and moderation.',
  },
] as const;

const agentSession = [
  { prompt: true, text: 'claude mcp add backbricks -- npx backbricks mcp' },
  { prompt: false, text: '> Add a contact form with a CV upload to the site.' },
  { prompt: true, text: 'npx backbricks push' },
  { prompt: true, text: 'npx backbricks test submit forms/contact' },
  { prompt: false, text: '✓ Test entry is in the dashboard inbox' },
] as const;

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      tone="mortar"
      title="Your agent builds it. The owner runs it."
      intro="No database, backend or storage to set up. The integration happens in code; the people who own the site never have to touch it."
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
          <pre className="code-block" aria-label="Example agent session">
            {agentSession.map((line) => (
              <div key={line.text}>
                {line.prompt ? <span className="token keyword select-none">$ </span> : null}
                <span className={line.prompt ? undefined : 'token comment'}>{line.text}</span>
              </div>
            ))}
          </pre>
          <figcaption className="mt-3 text-sm text-muted-foreground">
            The planned CLI and MCP flow, arriving in v0.4.
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
