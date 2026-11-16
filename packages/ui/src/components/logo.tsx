import { cn } from 'cn';

type LogoProps = { className?: string };

/** Backbricks mark: three bricks in running bond. Uses `currentColor`, so callers set the color. */
export function LogoMark({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="2" y="18" width="13" height="10" rx="2.5" fill="currentColor" />
      <rect x="17" y="18" width="13" height="10" rx="2.5" fill="currentColor" opacity="0.7" />
      <rect x="9.5" y="5" width="13" height="10" rx="2.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

/** Mark plus word mark. The word is real text, so the logo reads correctly to screen readers. */
export function Logo({ className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-heading text-lg font-semibold tracking-tight',
        className,
      )}
    >
      <LogoMark className="size-7 shrink-0 text-brand" />
      Backbricks
    </span>
  );
}

/**
 * The small brick that marks where you are (DESIGN.md "Layout"). Decorative: the link it sits
 * in must carry `aria-current` so assistive technology gets the same information.
 */
export function BrickMarker({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-active={active}
      className={cn(
        'h-2 w-4 shrink-0 rounded-xs bg-transparent transition-colors data-[active=true]:bg-brand',
        className,
      )}
    />
  );
}
