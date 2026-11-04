import { BotIcon, LayoutDashboardIcon, PaletteIcon } from 'lucide-react';

import { Section } from './section.tsx';

const steps = [
  {
    icon: BotIcon,
    title: 'Your agent connects',
    text: 'Claude Code, Codex or any MCP-capable agent reads the integration guide, defines forms and upload areas as config-as-code and wires them into your site.',
  },
  {
    icon: PaletteIcon,
    title: 'Your site keeps its look',
    text: 'Backbricks is headless: no widgets, iframes or CSS. Use plain HTML forms, the TypeScript SDK or the REST API from any framework.',
  },
  {
    icon: LayoutDashboardIcon,
    title: 'Owners run the rest',
    text: 'Entries, files and reviews land in a dashboard written for non-technical people, with notifications, exports and moderation.',
  },
] as const;

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How it works"
      title="Built for AI coding agents, managed by humans"
      intro="No database, backend or storage to set up. Your agent does the integration; the people who own the site never have to touch code."
    >
      <ol className="grid gap-10 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                <step.icon className="size-5 text-brand" />
              </span>
              <span className="text-sm text-muted-foreground">Step {index + 1}</span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
