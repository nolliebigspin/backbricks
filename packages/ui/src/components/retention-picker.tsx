import type * as React from 'react';

import { NativeSelect, NativeSelectOption } from '#components/native-select';

/** Common choices; any other stored value is kept as an extra option instead of being lost. */
export const RETENTION_PRESETS = [30, 90, 180, 365, 730] as const;
const UNLIMITED = 'unlimited';

type RetentionPickerProps = Omit<
  React.ComponentProps<typeof NativeSelect>,
  'value' | 'onChange' | 'children'
> & {
  /** Days, or `null` for "keep without a time limit". */
  value: number | null;
  onChange: (value: number | null) => void;
  dayLabel: (days: number) => string;
  unlimitedLabel: string;
  presets?: readonly number[];
};

/** Retention choice shared by every module with personal records (§F.4). */
export function RetentionPicker({
  value,
  onChange,
  dayLabel,
  unlimitedLabel,
  presets = RETENTION_PRESETS,
  ...props
}: RetentionPickerProps) {
  const options =
    value === null || presets.includes(value)
      ? presets
      : [...presets, value].toSorted((a, b) => a - b);
  return (
    <NativeSelect
      {...props}
      value={value === null ? UNLIMITED : String(value)}
      onChange={(event) =>
        onChange(event.target.value === UNLIMITED ? null : Number(event.target.value))
      }
    >
      {options.map((days) => (
        <NativeSelectOption key={days} value={String(days)}>
          {dayLabel(days)}
        </NativeSelectOption>
      ))}
      <NativeSelectOption value={UNLIMITED}>{unlimitedLabel}</NativeSelectOption>
    </NativeSelect>
  );
}
