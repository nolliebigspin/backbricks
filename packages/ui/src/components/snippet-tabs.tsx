import { cn } from 'cn';
import type * as React from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/tabs';

/** One code example in a {@link SnippetTabs} group. */
export type Snippet = {
  /** Stable id, e.g. `html`, `react`, `nextjs`. */
  id: string;
  /** Tab label shown to the user, e.g. `Next.js`. */
  label: string;
  /**
   * The rendered code. Callers pass already-rendered nodes (a `<pre>`, or syntax-highlighted
   * markup produced at build time), so this component never parses or injects HTML.
   */
  content: React.ReactNode;
};

type SnippetTabsProps = {
  snippets: readonly Snippet[];
  /** Id of the tab shown first; defaults to the first snippet. */
  defaultId?: string;
  /** Accessible name for the tab list, e.g. "Integration examples". */
  label: string;
  className?: string;
};

/**
 * Tabbed code examples for several frameworks (HTML/JS/React/Next/Astro).
 * Used on the marketing site and in the dashboard's "Embed" page.
 */
export function SnippetTabs({ snippets, defaultId, label, className }: SnippetTabsProps) {
  const first = snippets[0];
  if (!first) return null;

  return (
    <Tabs defaultValue={defaultId ?? first.id} className={cn('w-full min-w-0', className)}>
      <TabsList aria-label={label}>
        {snippets.map((snippet) => (
          <TabsTrigger key={snippet.id} value={snippet.id}>
            {snippet.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {snippets.map((snippet) => (
        <TabsContent key={snippet.id} value={snippet.id} className="min-w-0 overflow-x-auto">
          {snippet.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
