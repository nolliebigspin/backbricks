import { cn } from '@backbricks/ui';

import { bricks } from '../content/site.ts';
import { Section } from './section.tsx';

/** One row per brick, like a spec sheet: the same two questions answered for each. */
export function Bricks() {
  return (
    <Section
      id="bricks"
      title="Each brick does one job, completely"
      intro="A brick is an API for your website plus a page in the dashboard for the people who run it. Turn on only the ones you use; the rest are never deployed."
    >
      <div className="hidden border-b pb-3 text-sm text-muted-foreground md:grid md:grid-cols-12 md:gap-8">
        <span className="col-span-3">Brick</span>
        <span className="col-span-4 col-start-5">For your website</span>
        <span className="col-span-4">For the site owner</span>
      </div>
      <ul>
        {bricks.map((brick) => (
          <li
            key={brick.name}
            className="grid gap-4 border-b py-8 md:grid-cols-12 md:gap-8 md:py-10"
          >
            <div className="flex items-start gap-3 md:col-span-3">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-2.5 h-3 w-6 shrink-0 rounded-xs border-2 border-brand',
                  brick.status === 'available' && 'bg-brand',
                )}
              />
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">{brick.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {brick.status === 'available'
                    ? `Available in ${brick.release}`
                    : `Coming in ${brick.release}`}
                </p>
              </div>
            </div>
            <p className="text-pretty md:col-span-4 md:col-start-5">
              <span className="font-medium md:hidden">For your website: </span>
              {brick.forWebsite}
            </p>
            <p className="text-pretty text-muted-foreground md:col-span-4">
              <span className="font-medium text-foreground md:hidden">For the site owner: </span>
              {brick.forOwner}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
