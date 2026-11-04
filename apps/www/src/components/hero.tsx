import { Badge, Button } from '@backbricks/ui';
import { ArrowRightIcon } from 'lucide-react';

import { links, site } from '../content/site.ts';
import { ExternalLink } from './external-link.tsx';
import { GitHubIcon } from './github-icon.tsx';

const agentSession = [
  { prompt: true, text: 'claude mcp add backbricks -- npx backbricks mcp' },
  { prompt: false, text: '> Add a contact form with a CV upload to the site.' },
  { prompt: true, text: 'npx backbricks push' },
  { prompt: true, text: 'npx backbricks test submit forms/contact' },
  { prompt: false, text: '✓ Test entry is in the dashboard inbox' },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-20 pb-16 sm:pt-28 lg:grid-cols-2">
        <div>
          <Badge variant="outline">{site.status} · open source</Badge>
          <h1 className="mt-6 font-heading text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            Backend bricks for <span className="text-brand">any website</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
            Forms, file uploads, reviews and more. Your AI coding agent builds the frontend.
            Backbricks handles everything behind it, and site owners manage what comes in from a
            simple dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <ExternalLink href={links.repo}>
                <GitHubIcon data-icon="inline-start" />
                Star on GitHub
              </ExternalLink>
            </Button>
            <Button asChild size="lg" variant="outline">
              <ExternalLink href={links.roadmap}>
                See the roadmap
                <ArrowRightIcon data-icon="inline-end" />
              </ExternalLink>
            </Button>
          </div>
        </div>
        <figure className="min-w-0">
          <pre className="code-block" aria-label="Example agent session">
            {agentSession.map((line) => (
              <div key={line.text}>
                {line.prompt ? <span className="text-brand select-none">$ </span> : null}
                <span className={line.prompt ? undefined : 'text-ring'}>{line.text}</span>
              </div>
            ))}
          </pre>
          <figcaption className="mt-3 text-sm text-muted-foreground">
            How integration is planned to work. Backbricks is in pre-alpha.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
