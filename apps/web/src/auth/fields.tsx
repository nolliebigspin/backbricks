import { Input, Label } from '@backbricks/ui';
import { useId, type ComponentProps } from 'react';

/** Shared accessible field; browser constraints complement the authoritative server validation. */
export function Field({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input {...props} id={id} />
    </div>
  );
}

/** Text fields must never stringify an unexpected uploaded file. */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
