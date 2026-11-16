import { Button } from '@backbricks/ui';

import { links, site } from '../content/site.ts';
import { ExternalLink } from './external-link.tsx';
import { GitHubIcon } from './github-icon.tsx';
import { ModuleWall } from './module-wall.tsx';

export function Hero() {
  return (
    <section className="overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-sm text-muted-foreground">
          Open source <span className="text-foreground">{site.status.toLowerCase()}</span>
        </p>
        <h1 className="mt-5 max-w-4xl text-display font-bold">Backend bricks for any website.</h1>
        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Forms, file uploads and reviews without running a backend. Your AI coding agent wires
            them into the site; the people who own it read what comes in from a plain dashboard.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <ExternalLink href={links.repo}>
                <GitHubIcon data-icon="inline-start" />
                Star on GitHub
              </ExternalLink>
            </Button>
            <Button asChild size="lg" variant="outline">
              <ExternalLink href={links.roadmap}>See the roadmap</ExternalLink>
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-16 sm:mt-20">
        <ModuleWall />
      </div>
    </section>
  );
}
