import {
  brickStatusLabel,
  bricks,
  faq,
  links,
  logoPath,
  ogImage,
  site,
  siteUrl,
} from '../content/site.ts';

/** One schema.org node in the page's JSON-LD `@graph`. */
export type JsonLdNode = { '@type': string | string[]; '@id'?: string } & Record<string, unknown>;

const url = (path: string) => new URL(path, siteUrl).href;
const ids = {
  organization: url('/#organization'),
  website: url('/#website'),
  software: url('/#software'),
  faq: url('/#faq'),
} as const;

/** Nodes every page carries: who publishes the site and what the site is. */
export function siteNodes(): JsonLdNode[] {
  return [
    {
      '@type': 'Organization',
      '@id': ids.organization,
      name: site.name,
      url: url('/'),
      logo: { '@type': 'ImageObject', url: url(logoPath), width: 512, height: 512 },
      sameAs: [links.repo],
    },
    {
      '@type': 'WebSite',
      '@id': ids.website,
      name: site.name,
      url: url('/'),
      description: site.description,
      inLanguage: 'en',
      publisher: { '@id': ids.organization },
    },
  ];
}

/** Nodes for the landing page: the product itself and its FAQ. */
export function landingNodes(): JsonLdNode[] {
  return [
    {
      '@type': 'SoftwareApplication',
      '@id': ids.software,
      name: site.name,
      description: site.description,
      url: url('/'),
      image: url(ogImage.path),
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Backend as a service',
      operatingSystem: 'Linux, macOS, Windows (Docker)',
      softwareHelp: links.architecture,
      license: 'https://www.gnu.org/licenses/agpl-3.0.html',
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        name: 'Self-hosted',
        price: '0',
        priceCurrency: 'EUR',
      },
      featureList: bricks.map(
        (brick) => `${brick.name} (${brickStatusLabel(brick)}): ${brick.forWebsite}`,
      ),
      sameAs: [links.repo],
      publisher: { '@id': ids.organization },
    },
    {
      '@type': 'FAQPage',
      '@id': ids.faq,
      isPartOf: { '@id': ids.website },
      about: { '@id': ids.software },
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ];
}

/**
 * Serializes nodes into the body of a `<script type="application/ld+json">`. `<` is escaped so
 * no string can close the script element early.
 */
export function toJsonLd(nodes: readonly JsonLdNode[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replaceAll(
    '<',
    '\\u003c',
  );
}
