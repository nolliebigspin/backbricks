import { CheckIcon } from 'lucide-react';

import { Section } from './section.tsx';

const defaults = [
  'Proof-of-work spam protection instead of third-party captchas',
  'IP addresses stored only as rotating hashes',
  'Retention rules on every record with personal data',
  'GDPR export and erasure built in',
  'Private files, scanned for malware, downloaded via short-lived links',
  'Notification emails without submission content by default',
] as const;

export function SafeDefaults() {
  return (
    <Section
      eyebrow="EU-first"
      title="Privacy and security by default"
      intro="Public endpoints are built for the open internet: validated, rate limited and designed so that a leaked key can't expose your data."
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        {defaults.map((item) => (
          <li key={item} className="flex gap-3">
            <CheckIcon className="mt-0.5 size-5 shrink-0 text-brand" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
