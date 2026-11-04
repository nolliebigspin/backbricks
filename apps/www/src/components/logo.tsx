type LogoProps = { className?: string };

/** Backbricks mark: three offset bricks. Uses `currentColor`, so callers set the color. */
export function LogoMark({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="2" y="18" width="13" height="10" rx="2.5" fill="currentColor" />
      <rect x="17" y="18" width="13" height="10" rx="2.5" fill="currentColor" opacity="0.7" />
      <rect x="9.5" y="5" width="13" height="10" rx="2.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function Logo({ className }: LogoProps) {
  return (
    <span className={className}>
      <span className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
        <LogoMark className="size-7 text-brand" />
        Backbricks
      </span>
    </span>
  );
}
