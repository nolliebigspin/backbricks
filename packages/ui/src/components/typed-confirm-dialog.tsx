import { useId, useState } from 'react';
import type * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/alert-dialog';
import { Input } from '#components/input';
import { Label } from '#components/label';

/**
 * Confirmation for changes that lose data: the confirm button stays disabled until the exact
 * word (usually the resource's short name) is typed (§E.5 "safe destructiveness").
 */
export function TypedConfirmDialog({
  title,
  description,
  confirmText,
  typeLabel,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description: string;
  /** The word to type, e.g. the form's short name. */
  confirmText: string;
  /** Label of the input, e.g. `Type "contact" to confirm`. */
  typeLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Optional details between the description and the input, e.g. a list of changes. */
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const id = useId();
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <div className="space-y-2">
          <Label htmlFor={id}>{typeLabel}</Label>
          <Input
            id={id}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={typed !== confirmText}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
