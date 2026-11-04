import { Badge, Card, CardContent, CardHeader, CardTitle } from '@backbricks/ui';
import { FileUpIcon, MessageSquareTextIcon, StarIcon } from 'lucide-react';
import type * as React from 'react';

import { bricks, upcomingBricks } from '../content/site.ts';
import { Section } from './section.tsx';

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  Forms: MessageSquareTextIcon,
  Uploads: FileUpIcon,
  Reviews: StarIcon,
};

export function Bricks() {
  return (
    <Section
      id="bricks"
      eyebrow="The bricks"
      title="Pick the bricks you need"
      intro="Each brick is a complete backend feature: an API for your website and a page in the dashboard for the people who run it. Enable only what you use."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {bricks.map((brick) => {
          const Icon = icons[brick.name];
          return (
            <Card key={brick.name}>
              <CardHeader>
                {Icon ? <Icon className="size-6 text-brand" /> : null}
                <CardTitle>{brick.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="font-medium">For your website</dt>
                    <dd className="mt-1 text-muted-foreground">{brick.forWebsite}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">For the site owner</dt>
                    <dd className="mt-1 text-muted-foreground">{brick.forOwner}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="mt-12">
        <h3 className="font-medium">More bricks after 1.0</h3>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Candidate bricks">
          {upcomingBricks.map((name) => (
            <li key={name}>
              <Badge variant="secondary">{name}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
