const FORMULA_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r']);

/** RFC 4180 record, with spreadsheet-formula defusing before CSV quoting (I8). */
export function csvRow(values: readonly string[]): string {
  return (
    values
      .map((value) => {
        const text = FORMULA_PREFIXES.has(value.charAt(0)) ? "'" + value : value;
        return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      })
      .join(',') + '\r\n'
  );
}
