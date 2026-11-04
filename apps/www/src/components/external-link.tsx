import type * as React from 'react';

type ExternalLinkProps = Omit<React.ComponentProps<'a'>, 'target' | 'rel'>;

/** Link to another site: opens in a new tab without leaking the opener or referrer. */
export function ExternalLink({ children, ...props }: ExternalLinkProps) {
  return (
    <a target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}
