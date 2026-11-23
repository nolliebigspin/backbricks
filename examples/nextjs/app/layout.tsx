import type { ReactNode } from 'react';

// oxlint-disable-next-line import/no-default-export -- Next.js App Router convention.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
