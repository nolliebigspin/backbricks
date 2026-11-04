import type * as React from 'react';

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
};

/** Page section with the shared heading layout, so every section looks and reads the same. */
export function Section({ id, eyebrow, title, intro, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="text-sm font-semibold tracking-wide text-brand uppercase">{eyebrow}</p>
          ) : null}
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h2>
          {intro ? <p className="mt-4 text-lg text-pretty text-muted-foreground">{intro}</p> : null}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}
