import { links } from '../content/site.ts';
import { ExternalLink } from './external-link.tsx';
import { Section } from './section.tsx';

const options = [
  {
    title: 'Self-hosted',
    terms: 'Free, AGPL-3.0, available now',
    text: 'Run everything with Docker Compose on your own Postgres and S3-compatible storage. Modules are optional: only the services your enabled bricks need are deployed.',
  },
  {
    title: 'Managed EU cloud',
    terms: 'Planned after 1.0',
    text: 'The same code, operated for you in the EU. No separate edition and no features held back from self-hosters.',
  },
] as const;

export function OpenSource() {
  return (
    <Section
      id="open-source"
      title="Self-host it, or let us run it"
      intro="The complete platform is open source. No calls home, no feature lock."
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
            <p className="mt-1 text-sm text-muted-foreground">{option.terms}</p>
            <p className="mt-4 max-w-prose text-pretty">{option.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
        The SDK and CLI are MIT-licensed, so integrating Backbricks never puts AGPL obligations on
        your website.{' '}
        <ExternalLink href={links.licensing} className="text-brand underline underline-offset-4">
          Licensing details
        </ExternalLink>
      </p>
    </Section>
  );
}
