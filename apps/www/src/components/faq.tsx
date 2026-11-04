import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@backbricks/ui';

const questions = [
  {
    q: 'Can I use Backbricks today?',
    a: 'Not yet. Backbricks is in pre-alpha: the architecture and roadmap are done and implementation has started. The first developer preview ships the forms brick. Star or watch the GitHub repository to follow along.',
  },
  {
    q: 'Do I need an AI coding agent?',
    a: 'No. The REST API, TypeScript SDK and CLI work just as well by hand. Agents get first-class support on top: an MCP server, config-as-code and an integration guide written for them.',
  },
  {
    q: 'Which frameworks does it work with?',
    a: 'Any. Plain HTML forms work without JavaScript, and the SDK runs in browsers, Node, Bun and Deno. Next.js, Astro, Vue, SvelteKit or a static site all integrate the same way.',
  },
  {
    q: 'Will it change how my website looks?',
    a: 'No. Backbricks is headless and ships no widgets, iframes or CSS. Your website keeps its own design.',
  },
  {
    q: 'What does it cost?',
    a: 'Self-hosting is free and complete, with no feature lock. Pricing for the managed EU cloud will be announced closer to its launch after 1.0.',
  },
  {
    q: 'Why AGPL?',
    a: 'It keeps Backbricks open: anyone who offers a modified version as a service has to share their changes. Your website is not affected, because the SDK and CLI you integrate are MIT-licensed.',
  },
] as const;

/** Island: FAQ accordion on the landing page. */
export function Faq() {
  return (
    <Accordion type="single" collapsible>
      {questions.map((item) => (
        <AccordionItem key={item.q} value={item.q}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent>
            <p className="text-muted-foreground">{item.a}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
