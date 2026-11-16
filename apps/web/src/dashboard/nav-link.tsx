import { BrickMarker } from '@backbricks/ui';
import { useLocation } from '@tanstack/react-router';
import type * as React from 'react';

/** A labelled group of sidebar links; the label names the landmark for assistive technology. */
export function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label}>
      <ul className="space-y-0.5">{children}</ul>
    </nav>
  );
}

/**
 * Sidebar link that marks the current page with the brick (docs/DESIGN.md). `exact` links match
 * only their own path; others also stay current on their sub-pages.
 */
export function NavLink({
  href,
  exact = false,
  children,
}: {
  href: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <li>
      <a
        href={href}
        aria-current={active ? 'page' : undefined}
        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
      >
        <BrickMarker active={active} />
        {children}
      </a>
    </li>
  );
}
