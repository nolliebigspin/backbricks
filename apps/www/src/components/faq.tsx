import { ChevronDownIcon } from 'lucide-react';

import { faq } from '../content/site.ts';

/**
 * FAQ as native `<details>` elements instead of the Radix accordion: Radix renders closed answers
 * as nothing, so search and answer engines never saw them. `<details>` keeps every answer in the
 * static HTML, works without JavaScript and finds answers with the browser's in-page search.
 * The shared `name` lets only one answer open at a time, like the accordion did.
 */
export function Faq() {
  return (
    <div className="flex w-full flex-col">
      {faq.map((item) => (
        <details key={item.question} name="faq" className="group not-last:border-b">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg py-2.5 hover:underline [&::-webkit-details-marker]:hidden">
            <h3 className="font-sans text-sm font-medium">{item.question}</h3>
            <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="pb-2.5 text-sm text-pretty text-muted-foreground">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
