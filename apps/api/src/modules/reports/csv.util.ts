/**
 * RFC 4180 field/row escaping for the three characters that break a bare CSV
 * field (comma, quote, newline). A handful of report columns doesn't justify
 * a dependency, so this stays local to the module.
 */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvEscape).join(',') + '\r\n';
}
