import { Button } from '@backbricks/ui';

import { links, nav } from '../content/site.ts';
import { ExternalLink } from './external-link.tsx';
import { GitHubIcon } from './github-icon.tsx';
import { Logo } from './logo.tsx';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <a href="/" aria-label="Backbricks home">
          <Logo />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Button asChild variant="outline">
          <ExternalLink href={links.repo}>
            <GitHubIcon data-icon="inline-start" />
            GitHub
          </ExternalLink>
        </Button>
      </div>
    </header>
  );
}
