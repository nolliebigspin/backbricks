import { cn } from 'cn';
import type * as React from 'react';

/** A friendly first screen instead of an empty list (§E.5). Copy comes from the caller. */
export function EmptyState({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  /** Optional actions, e.g. a link to the next step. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center',
        className,
      )}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </section>
  );
}
