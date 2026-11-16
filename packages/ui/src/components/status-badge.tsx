import type * as React from 'react';

import { Badge } from '#components/badge';

/** What a status means to the user, independent of the module that owns it. */
export type StatusTone = 'positive' | 'neutral' | 'warning' | 'danger';
const variants = {
  positive: 'success',
  neutral: 'secondary',
  warning: 'warning',
  danger: 'destructive',
} as const;

/** One badge style per meaning, so statuses look the same across modules. Color always pairs with the label. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <Badge variant={variants[tone]} data-tone={tone}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  );
}
