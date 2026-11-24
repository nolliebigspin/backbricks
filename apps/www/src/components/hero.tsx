import { Button } from '@backbricks/ui';
import { ArrowRightIcon } from 'lucide-react';

import { site } from '../content/site.ts';
import { ModuleWall } from './module-wall.tsx';

export function Hero() {
  return (
    <section className="overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-sm text-muted-foreground">Open source · {site.status}</p>
        <h1 className="mt-5 max-w-4xl text-display font-bold">Backend bricks for any website.</h1>
        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Collect form entries, handle private uploads, and publish reviews. Build the interface
            your way and give site owners one dashboard to manage what comes in.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="/docs">
                Get started
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="/docs/self-host">Self-host with Docker</a>
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
