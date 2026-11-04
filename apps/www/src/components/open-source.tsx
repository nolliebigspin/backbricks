import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@backbricks/ui';
import { CloudIcon, ServerIcon } from 'lucide-react';

import { links } from '../content/site.ts';
import { ExternalLink } from './external-link.tsx';
import { Section } from './section.tsx';

export function OpenSource() {
  return (
    <Section
      id="open-source"
      eyebrow="Open source"
      title="Self-host it, or let us run it"
      intro="The complete platform is open source. No calls home, no feature lock."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <ServerIcon className="size-6 text-brand" />
            <CardTitle>Self-hosted</CardTitle>
            <CardDescription>Free, AGPL-3.0</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Run everything with Docker Compose on your own Postgres and S3-compatible storage.
              Modules are optional: only the services your enabled bricks need are deployed.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CloudIcon className="size-6 text-brand" />
            <CardTitle>Managed EU cloud</CardTitle>
            <CardDescription>
              <Badge variant="secondary">After 1.0</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The same code, operated for you in the EU. Planned after the open-source 1.0 release.
            </p>
          </CardContent>
        </Card>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        The SDK and CLI are MIT-licensed, so integrating Backbricks never puts AGPL obligations on
        your website.{' '}
        <ExternalLink href={links.licensing} className="underline underline-offset-4">
          Licensing details
        </ExternalLink>
      </p>
    </Section>
  );
}
