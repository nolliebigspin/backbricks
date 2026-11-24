import { cn } from '@backbricks/ui';

import { brickAvailability, bricks, upcomingBricks } from '../content/site.ts';

type WallBrick = { name: string; kind: 'available' | 'candidate' | 'blank' };

const candidates: WallBrick[] = upcomingBricks.map((name) => ({ name, kind: 'candidate' }));
const available: WallBrick[] = bricks.map(({ name }) => ({ name, kind: 'available' }));

/** Unlabelled bricks so every course is wide enough to run off both edges of the screen. */
const COURSE_LENGTH = 11;
function pad(course: WallBrick[], courseIndex: number): WallBrick[] {
  const missing = Math.max(0, COURSE_LENGTH - course.length);
  const blank = (side: string, i: number): WallBrick => ({
    name: `blank-${courseIndex}-${side}-${i}`,
    kind: 'blank',
  });
  const left = Math.floor(missing / 2);
  return [
    ...Array.from({ length: left }, (_, i) => blank('l', i)),
    ...course,
    ...Array.from({ length: missing - left }, (_, i) => blank('r', i)),
  ];
}

/*
 * Three courses in running bond. The v1 bricks sit in the middle of the center course, so they
 * stay visible at every width; candidates surround them and the wall bleeds off both edges.
 */
const side = Math.floor((candidates.length - 2) / 2);
const courses: WallBrick[][] = [
  candidates.slice(0, side),
  [...candidates.slice(side, side + 1), ...available, ...candidates.slice(side + 1, side + 2)],
  candidates.slice(side + 2),
].map(pad);

const brickStyles: Record<WallBrick['kind'], string> = {
  available: 'border-brand bg-brand text-brand-foreground',
  candidate: 'border-border bg-background text-muted-foreground',
  blank: 'border-border bg-muted',
};

/** The website hero's wall shows the available modules and candidates for after 1.0. */
export function ModuleWall() {
  return (
    <figure className="relative">
      <div className="flex flex-col items-center gap-2 overflow-hidden py-1 sm:mask-x-from-70% sm:gap-2.5">
        {courses.map((course, index) => (
          <ul
            // The middle course carries the v1 bricks; the outer ones are offset by half a brick.
            key={course[0]?.name ?? index}
            className={cn(
              'flex shrink-0 gap-2 sm:gap-2.5 motion-safe:animate-in motion-safe:fill-mode-both motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700',
              index === 1 ? 'motion-safe:delay-150' : 'translate-x-14 sm:translate-x-24',
              index === 2 && 'motion-safe:delay-300',
            )}
          >
            {course.map((brick) => (
              <li
                key={brick.name}
                aria-hidden={brick.kind === 'blank' || undefined}
                className={cn(
                  'flex h-14 w-25 shrink-0 flex-col justify-center rounded-md border-2 px-2.5 sm:h-20 sm:w-48 sm:px-4',
                  brickStyles[brick.kind],
                )}
              >
                {brick.kind === 'blank' ? null : (
                  <span
                    className={cn(
                      'truncate font-heading leading-tight',
                      brick.kind === 'candidate'
                        ? 'text-xs sm:text-sm'
                        : 'text-base font-semibold sm:text-xl',
                    )}
                  >
                    {brick.name}
                  </span>
                )}
                {brick.kind === 'available' ? (
                  <span className="truncate text-xs opacity-90">{brickAvailability}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ))}
      </div>
      <figcaption className="mx-auto mt-6 flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-5 rounded-xs bg-brand" />
          {brickAvailability}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-5 rounded-xs border-2 border-border" />
          Candidates after 1.0
        </span>
      </figcaption>
    </figure>
  );
}
