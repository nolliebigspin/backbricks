/** Copy for values that have no text of their own; supplied by the caller's translations. */
export type FieldValueLabels = {
  yes: string;
  no: string;
  empty: string;
  accepted: (version: string) => string;
};

type Option = { value: string; label: string };

function text(value: unknown, options: readonly Option[] | undefined, labels: FieldValueLabels) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? labels.yes : labels.no;
  if (typeof value === 'string')
    return options?.find((option) => option.value === value)?.label ?? value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === 'string'
          ? (options?.find((option) => option.value === item)?.label ?? item)
          : JSON.stringify(item),
      )
      .join(', ');
  if (typeof value === 'object' && 'accepted' in value && 'version' in value)
    return value.accepted === true && typeof value.version === 'string'
      ? labels.accepted(value.version)
      : labels.no;
  return JSON.stringify(value);
}

/**
 * Any stored answer as plain text (I8): values become React text nodes, never markup or links,
 * so `<img onerror=…>` shows up literally. Option values show their label.
 */
export function FieldValue({
  value,
  options,
  labels,
}: {
  value: unknown;
  options?: readonly Option[];
  labels: FieldValueLabels;
}) {
  const content = text(value, options, labels);
  return content === null ? (
    <span className="text-muted-foreground">{labels.empty}</span>
  ) : (
    <span className="break-words whitespace-pre-wrap">{content}</span>
  );
}
