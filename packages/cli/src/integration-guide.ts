import guide from '../../../docs/integration/agent.md' with { type: 'text' };
import astro from '../../../docs/integration/pages/astro.md' with { type: 'text' };
import html from '../../../docs/integration/pages/html.md' with { type: 'text' };
import nextjs from '../../../docs/integration/pages/nextjs.md' with { type: 'text' };
import vue from '../../../docs/integration/pages/vue.md' with { type: 'text' };
import type { Framework } from './project-files.ts';

const frameworkGuides = {
  astro,
  html,
  nextjs,
  vue,
  nuxt: 'Run `backbricks init --framework nuxt`. Wire the `NUXT_PUBLIC_BACKBRICKS_KEY` and `NUXT_PUBLIC_BACKBRICKS_URL` values through Nuxt public runtime config for the browser SDK.',
} satisfies Record<Framework, string>;

export function integrationGuide(framework?: Framework) {
  if (!framework) return guide;
  const instructions = frameworkGuides[framework].replace(/^---\n[\s\S]*?\n---\n/, '');
  return `${guide.trimEnd()}\n\n${instructions.trim()}\n`;
}
