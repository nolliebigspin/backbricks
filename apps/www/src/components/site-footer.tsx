import { footerLinks, site } from '../content/site.ts';
import { ExternalLink } from './external-link.tsx';
import { Logo } from './logo.tsx';

type SiteFooterProps = { year: number };

export function SiteFooter({ year }: SiteFooterProps) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-muted-foreground">
            {site.tagline} Open source under AGPL-3.0; SDK and CLI under MIT.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {footerLinks.map((link) => {
              const className = 'text-muted-foreground transition-colors hover:text-foreground';
              return (
                <li key={link.href}>
                  {link.href.startsWith('/') ? (
                    <a href={link.href} className={className}>
                      {link.label}
                    </a>
                  ) : (
                    <ExternalLink href={link.href} className={className}>
                      {link.label}
                    </ExternalLink>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-6 pb-10 text-xs text-muted-foreground">
        © {year} Backbricks contributors.
      </div>
    </footer>
  );
}
