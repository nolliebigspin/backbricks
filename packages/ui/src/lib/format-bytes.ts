const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'] as const;
/** Format capacity without converting a potentially unsafe integer to Number. */
export function formatBytes(value: bigint, locale: string): string {
  if (value < 0n) throw new RangeError('Capacity must be nonnegative.');
  let divisor = 1n;
  let unit = 0;
  while (unit < units.length - 1 && value >= divisor * 1024n) {
    divisor *= 1024n;
    unit += 1;
  }
  const integer = new Intl.NumberFormat(locale).format(value / divisor);
  const tenth = ((value % divisor) * 10n) / divisor;
  const separator =
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.';
  return `${integer}${tenth ? separator + tenth.toString() : ''} ${units[unit]}`;
}
