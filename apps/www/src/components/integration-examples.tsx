import { type Snippet, SnippetTabs } from '@backbricks/ui';
import { isValidElement } from 'react';

type IntegrationExamplesProps = {
  tabs: readonly { id: string; label: string }[];
} & {
  /**
   * Highlighted code per tab, passed from Astro as named slots (`slot="html"` → prop `html`).
   * Astro renders the slots at build time, so no highlighter ships to the browser.
   */
  [panel: string]: unknown;
};

/** Island: tabbed integration examples on the landing page. */
export function IntegrationExamples({ tabs, ...panels }: IntegrationExamplesProps) {
  const snippets: Snippet[] = tabs.map((tab) => {
    const panel = panels[tab.id];
    return { id: tab.id, label: tab.label, content: isValidElement(panel) ? panel : null };
  });

  return <SnippetTabs label="Integration examples" snippets={snippets} />;
}
