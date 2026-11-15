import { configObject as record } from '../../dashboard/config-values.ts';

export type ConfigField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  /** Consent fields: the text the visitor agrees to. */
  text?: string;
  options?: { value: string; label: string }[];
};

function fieldOf(value: unknown): ConfigField | null {
  const field = record(value);
  const { key, label, type, options, required, text } = field;
  if (typeof key !== 'string' || typeof label !== 'string' || typeof type !== 'string') return null;
  const choices = Array.isArray(options)
    ? options.flatMap((option) => {
        const { value: optionValue, label: optionLabel } = record(option);
        return typeof optionValue === 'string' && typeof optionLabel === 'string'
          ? [{ value: optionValue, label: optionLabel }]
          : [];
      })
    : undefined;
  return {
    key,
    label,
    type,
    ...(required === true ? { required } : {}),
    ...(typeof text === 'string' ? { text } : {}),
    ...(choices ? { options: choices } : {}),
  };
}

/** The form's fields in order, skipping entries that don't have the basic shape. */
export function configFields(config: unknown): ConfigField[] {
  const root = record(config);
  return (Array.isArray(root['fields']) ? root['fields'] : []).flatMap((value) => {
    const field = fieldOf(value);
    return field ? [field] : [];
  });
}

/** The server chooses default list values; explicit owner column order still comes from config. */
export function listColumns(config: unknown, returnedKeys: ReadonlySet<string>): ConfigField[] {
  const root = record(config);
  const fields = configFields(config);
  const chosen = Array.isArray(root['listFields'])
    ? root['listFields'].filter((key): key is string => typeof key === 'string')
    : null;
  return chosen
    ? chosen.flatMap((key) => fields.filter((field) => field.key === key))
    : fields.filter((field) => returnedKeys.has(field.key));
}

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
] as const;

/** Human times ("3 hours ago", §E.5); under a minute counts as now. */
export function relativeTime(date: Date, now: Date, language: string): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'second');
}
