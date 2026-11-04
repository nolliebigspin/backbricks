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
  title: 'Backbricks: backend bricks for any website',
  description:
    'Open-source backend for websites: forms, file uploads, reviews and more. Built for AI coding agents, managed by site owners in a simple dashboard. Self-hosted or EU cloud.',
  tagline: 'Backend bricks for any website.',
  status: 'Pre-alpha',
} as const;

export const nav = [
  { label: 'Bricks', href: '/#bricks' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Open source', href: '/#open-source' },
  { label: 'FAQ', href: '/#faq' },
] as const;

export type Brick = {
  name: string;
  forWebsite: string;
  forOwner: string;
};

/** The v1 modules (README "What it does"). */
export const bricks: readonly Brick[] = [
  {
    name: 'Forms',
    forWebsite:
      'Headless form API with server-side validation, spam protection and plain-HTML support.',
    forOwner: 'An inbox with search, status, CSV export, notifications and retention rules.',
  },
  {
    name: 'Uploads',
    forWebsite: 'Direct-to-storage uploads with type and size limits and malware scanning.',
    forOwner: 'Browse, download and delete files, and keep an eye on storage usage.',
  },
  {
    name: 'Reviews',
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

export const footerLinks = [
  { label: 'GitHub', href: links.repo },
  { label: 'Roadmap', href: links.roadmap },
  { label: 'Architecture', href: links.architecture },
  { label: 'Imprint', href: '/imprint' },
  { label: 'Privacy', href: '/privacy' },
] as const;
