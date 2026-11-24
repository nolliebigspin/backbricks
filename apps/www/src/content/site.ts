// Single source for site-wide data: URLs, navigation, module lists and copy reused across pages.

export const siteUrl = 'https://backbricks.app';

/** Vercel serves the static HTML output at extensionless URLs. */
export function publicPageUrl(pathname: string) {
  return new URL(pathname.replace(/(?:\/index)?\.html$/, '') || '/', siteUrl);
}

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
  { label: 'Self-host', href: '/#open-source' },
] as const;

export const brickAvailability = 'Self-hostable';

export type Brick = {
  name: string;
  guide: string;
  forWebsite: string;
  forOwner: string;
};

/** The modules available when self-hosting from source (README "What it does"). */
export const bricks: readonly Brick[] = [
  {
    name: 'Forms',
    guide: '/docs/forms',
    forWebsite:
      'Headless form API with server-side validation, spam protection and plain-HTML support.',
    forOwner: 'An inbox with search, status, CSV export, notifications and retention rules.',
  },
  {
    name: 'Uploads',
    guide: '/docs/uploads',
    forWebsite: 'Private file uploads with type and size limits and optional malware scanning.',
    forOwner: 'Browse, download and delete files, and keep an eye on storage usage.',
  },
  {
    name: 'Reviews',
    guide: '/docs/reviews',
    forWebsite: 'Collect reviews and show the published ones through a public read API.',
    forOwner: 'A moderation queue, publishing controls and rating stats.',
  },
];

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
      'Yes. Build the developer preview from source to self-host Forms, Uploads and Reviews. The packaged v0.1.0 release includes Forms. APIs may still change before 1.0.',
  },
  {
    question: 'Do I need an AI coding agent?',
    answer:
      'Use the API, SDK, or CLI directly, or connect an agent through MCP. Keep form, upload area, and review collection settings in versioned configuration when you want to review changes before applying them.',
  },
  {
    question: 'Which frameworks does it work with?',
    answer:
      'Use a native HTML form on a static site or connect any framework over HTTP. The TypeScript SDK works in browsers, Node.js, and Bun. The docs include Next.js, Astro, Vue, and HTML quickstarts.',
  },
  {
    question: 'Will it change how my website looks?',
    answer:
      'Your website keeps its own HTML, CSS, and components. Backbricks sends and receives data behind your existing design.',
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
      'The software is free to self-host on infrastructure you provide. Managed EU hosting is planned after 1.0.',
  },
  {
    question: 'Why AGPL?',
    answer:
      'It keeps Backbricks open: anyone who offers a modified version as a service has to share their changes. Your website is not affected, because the SDK and CLI you integrate are MIT-licensed.',
  },
];

export const footerLinks = [
  { label: 'Docs', href: '/docs' },
  { label: 'API reference', href: '/docs/api' },
  { label: 'GitHub', href: links.repo },
  { label: 'Roadmap', href: links.roadmap },
  { label: 'Architecture', href: links.architecture },
  { label: 'Imprint', href: '/imprint' },
  { label: 'Privacy', href: '/privacy' },
] as const;
