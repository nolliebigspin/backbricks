import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';

import { Button } from '#components/button';

/**
 * Details of one record in a side panel; full width on phones, where owners often read entries
 * (§E.5). Closing returns focus to the row that opened it.
 */
export function RecordDrawer({
  open,
  onOpenChange,
  title,
  closeLabel,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  /** Buttons shown under the title, e.g. status changes. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content
          data-slot="record-drawer"
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col gap-4 overflow-y-auto bg-popover p-5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none sm:max-w-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="text-lg font-semibold break-words">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm">
                <XIcon />
                <span className="sr-only">{closeLabel}</span>
              </Button>
            </DialogPrimitive.Close>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
