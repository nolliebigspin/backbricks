import type * as React from 'react';

type ProsePageProps = { title: string; children: React.ReactNode };

/** Layout for text pages (imprint, privacy). */
export function ProsePage({ title, children }: ProsePageProps) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-10 space-y-6 text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground">
        {children}
      </div>
    </article>
  );
}
