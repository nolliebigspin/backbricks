import { cn } from '@backbricks/ui';
import type * as React from 'react';

type SectionProps = {
  id?: string;
  title: string;
  intro?: string;
  /** A quiet mortar band, used once or twice per page to separate courses. */
  tone?: 'plain' | 'mortar';
  children: React.ReactNode;
};

/**
 * One course of the page: a joint line, the heading on the left, content below.
 * Every section shares this layout, so the page reads as one wall (docs/DESIGN.md).
 */
export function Section({ id, title, intro, tone = 'plain', children }: SectionProps) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-16 border-t py-20 sm:py-24', tone === 'mortar' && 'bg-muted')}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
          {intro ? <p className="mt-5 text-lg text-pretty text-muted-foreground">{intro}</p> : null}
        </div>
        <div className="mt-12 sm:mt-14">{children}</div>
      </div>
    </section>
  );
}
