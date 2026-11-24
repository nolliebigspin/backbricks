import { bricks } from '../content/site.ts';
import { Section } from './section.tsx';

/** One row per brick, like a spec sheet: the same two questions answered for each. */
export function Bricks() {
  return (
    <Section
      id="bricks"
      title="Three bricks, one dashboard"
      intro="Each brick gives your website an API and gives site owners a place to manage what comes in. Enable the modules your site needs."
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
              <span aria-hidden="true" className="mt-2.5 h-3 w-6 shrink-0 rounded-xs bg-brand" />
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">
                  <a
                    href={brick.guide}
                    className="underline-offset-4 hover:text-brand hover:underline"
                  >
                    {brick.name}
                  </a>
                </h3>
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
