import { Button } from '@backbricks/ui';

import { links } from '../content/site.ts';
import { ExternalLink } from './external-link.tsx';
import { Section } from './section.tsx';

const options = [
  {
    title: 'Run Backbricks on your server',
    text: 'Build the current preview from source. Production Compose supports HTTPS, first-owner setup, and encrypted backups. Run Forms alone or enable Uploads and Reviews as well.',
  },
  {
    title: 'Open-source platform and tools',
    text: 'The server and dashboard use AGPL-3.0. The SDK and CLI you use in your own project are MIT-licensed. Managed EU hosting is planned after 1.0.',
  },
] as const;

export function OpenSource() {
  return (
    <Section
      id="open-source"
      title="Self-host Backbricks"
      intro="Keep your form entries, private files, and reviews on infrastructure you control."
    >
      <div className="grid border-y md:grid-cols-2">
        {options.map((option, index) => (
          <div
            key={option.title}
            className={
              index === 0 ? 'py-8 md:pr-10' : 'border-t py-8 md:border-t-0 md:border-l md:pl-10'
            }
          >
            <h3 className="text-2xl font-semibold tracking-tight">{option.title}</h3>
            <p className="mt-4 max-w-prose text-pretty">{option.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Button asChild>
          <a href="/docs/self-host">Read the self-hosting guide</a>
        </Button>
        <ExternalLink href={links.licensing} className="text-brand underline underline-offset-4">
          Licensing details
        </ExternalLink>
      </div>
    </Section>
  );
}
