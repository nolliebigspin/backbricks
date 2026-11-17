// Single source for site-wide data: URLs, navigation, module lists and copy reused across pages.

export const siteUrl = 'https://backbricks.app';

const repoUrl = 'https://github.com/nolliebigspin/backbricks';

export const links = {
  repo: repoUrl,
  architecture: `${repoUrl}/blob/main/docs/ARCHITECTURE.md`,
  roadmap: `${repoUrl}/blob/main/docs/MILESTONES.md`,
  modules: `${repoUrl}/blob/main/docs/MODULES.md`,
  licensing: `${repoUrl}/blob/main/LICENSING.md`,
} as const;

export const site = {
  name: 'Backbricks',
  // Search snippets cut titles at ~60 and descriptions at ~155 characters.
  title: 'Backbricks: open-source backend for forms, uploads and reviews',
  description:
    'Open-source backend for website forms, file uploads and reviews. AI coding agents wire it in; site owners manage entries in a dashboard. Free to self-host.',
  tagline: 'Backend bricks for any website.',
  status: 'Developer preview',
  locale: 'en_US',
} as const;

/** Social preview image in `public/`. Dimensions let crawlers render the card before fetching it. */
export const ogImage = {
  path: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Backbricks: backend bricks for any website. Forms, uploads, reviews and more.',
} as const;

/** Square brand mark in `public/` for search results and structured data (≥ 112 px). */
export const logoPath = '/logo.png';

export const nav = [
  { label: 'Bricks', href: '/#bricks' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Open source', href: '/#open-source' },
  { label: 'FAQ', href: '/#faq' },
] as const;

/** `available`: released and usable. `roadmap`: scheduled for a pre-1.0 release. */
export type BrickStatus = 'available' | 'roadmap';

export type Brick = {
  name: string;
  status: BrickStatus;
  /** The release that ships (or shipped) the brick, from docs/MILESTONES.md. */
  release: string;
  forWebsite: string;
  forOwner: string;
};

/** The v1 modules (README "What it does"). */
export const bricks: readonly Brick[] = [
  {
    name: 'Forms',
    status: 'available',
    release: 'v0.1',
    forWebsite:
      'Headless form API with server-side validation, spam protection and plain-HTML support.',
    forOwner: 'An inbox with search, status, CSV export, notifications and retention rules.',
  },
  {
    name: 'Uploads',
    status: 'roadmap',
    release: 'v0.2',
    forWebsite: 'Direct-to-storage uploads with type and size limits and malware scanning.',
    forOwner: 'Browse, download and delete files, and keep an eye on storage usage.',
  },
  {
    name: 'Reviews',
    status: 'roadmap',
    release: 'v0.3',
    forWebsite: 'Collect reviews and show the published ones through a public read API.',
    forOwner: 'A moderation queue, publishing controls and rating stats.',
  },
];

/** "Available in v0.1" / "Coming in v0.2", the same wording on the page and for crawlers. */
export function brickStatusLabel(brick: Brick): string {
  return brick.status === 'available'
    ? `Available in ${brick.release}`
    : `Coming in ${brick.release}`;
}

/** Candidate modules after 1.0 (docs/MODULES.md). Candidates, not commitments. */
export const upcomingBricks = [
  'Waitlists',
  'Event registration',
  'Surveys',
  'Polls',
  'Feature voting',
  'Comments',
  'Live chat',
  'Appointment booking',
  'Analytics',
  'Cookie consent',
  'Job postings',
  'Galleries',
  'Product catalogs',
  'Protected content',
] as const;

export type FaqItem = { question: string; answer: string };

/**
 * Rendered on the landing page, as FAQPage structured data and in llms.txt. Answers stand on
 * their own (no "see above"), because search and answer engines quote them out of context.
 */
export const faq: readonly FaqItem[] = [
  {
    question: 'What is Backbricks?',
    answer:
      'Backbricks is an open-source, headless backend for websites. It adds forms, file uploads and reviews to any site through plain HTML, a TypeScript SDK or a REST API, and gives the people who run the site a dashboard to manage what comes in. You can self-host it with Docker Compose.',
  },
  {
    question: 'Can I use Backbricks today?',
    answer:
      'As a developer preview. Forms shipped in v0.1; uploads and reviews follow before 1.0, and APIs may still change until then. Star or watch the GitHub repository to follow along.',
  },
  {
    question: 'Do I need an AI coding agent?',
    answer:
      'No. The REST API, TypeScript SDK and CLI work just as well by hand. Agents get first-class support on top: an MCP server, config-as-code and an integration guide written for them.',
  },
  {
    question: 'Which frameworks does it work with?',
    answer:
      'Any. Plain HTML forms work without JavaScript, and the SDK runs in browsers, Node, Bun and Deno. Next.js, Astro, Vue, SvelteKit or a static site all integrate the same way.',
  },
  {
    question: 'Will it change how my website looks?',
    answer:
      'No. Backbricks is headless and ships no widgets, iframes or CSS. Your website keeps its own design.',
  },
  {
    question: 'How is Backbricks different from a form backend or Firebase?',
    answer:
      'Hosted form backends cover a single feature on someone else’s servers. Backend platforms such as Firebase or Supabase give you a database and auth, and you still build each feature and its admin screens yourself. Backbricks ships finished features, each with an API for your website and a dashboard page for its owner, and you can self-host all of it.',
  },
  {
    question: 'Where is my data stored?',
    answer:
      'Wherever you run Backbricks. Self-hosted, all data stays in your own Postgres database and S3-compatible storage, with no calls home. The managed cloud planned after 1.0 runs in the EU.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Self-hosting is free and complete, with no feature lock. Pricing for the managed EU cloud will be announced closer to its launch after 1.0.',
  },
  {
    question: 'Why AGPL?',
    answer:
      'It keeps Backbricks open: anyone who offers a modified version as a service has to share their changes. Your website is not affected, because the SDK and CLI you integrate are MIT-licensed.',
  },
];

export const footerLinks = [
  { label: 'GitHub', href: links.repo },
  { label: 'Roadmap', href: links.roadmap },
  { label: 'Architecture', href: links.architecture },
  { label: 'Imprint', href: '/imprint' },
  { label: 'Privacy', href: '/privacy' },
] as const;
