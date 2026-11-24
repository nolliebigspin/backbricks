import { CheckIcon } from 'lucide-react';

import { Section } from './section.tsx';

const defaults = [
  'Built-in proof-of-work spam protection for browser submissions',
  'IP addresses stored only as rotating hashes',
  'Configurable retention for entries, files, and reviews',
  'Built-in export and erasure for a person’s data',
  'Private files with optional malware scanning and short-lived download links',
  'Notification emails without submission content by default',
] as const;

export function SafeDefaults() {
  return (
    <Section
      title="Keep submitted data private"
      intro="Backbricks validates and rate-limits public requests. Dashboard roles and scoped secret keys control who can access private records."
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        {defaults.map((item) => (
          <li key={item} className="flex gap-3">
            <CheckIcon className="mt-0.5 size-5 shrink-0 text-success" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
