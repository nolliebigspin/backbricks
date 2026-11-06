import { useState } from 'react';

import { Button } from '#components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/dialog';
import { Input } from '#components/input';

/** A caller-owned ephemeral value; dismissing must remove it from the caller's state. */
export function KeyRevealDialog({
  token,
  title,
  description,
  copyLabel,
  closeLabel,
  copiedLabel,
  copyErrorLabel,
  onClose,
}: {
  token: string;
  title: string;
  description: string;
  copyLabel: string;
  closeLabel: string;
  copiedLabel: string;
  copyErrorLabel: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input aria-label={title} value={token} readOnly autoComplete="off" spellCheck={false} />
        {status === 'copied' && <output>{copiedLabel}</output>}
        {status === 'error' && <p role="alert">{copyErrorLabel}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {closeLabel}
          </Button>
          <Button
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(token);
                  setStatus('copied');
                } catch {
                  setStatus('error');
                }
              })();
            }}
          >
            {copyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
