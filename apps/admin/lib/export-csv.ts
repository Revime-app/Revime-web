/**
 * CSV Export utility for Revime Admin lists (UI8).
 * Complies with RFC 4180 and OWASP CSV Injection guidelines.
 * Uses UTF-8 BOM (\uFEFF) for compatibility with Microsoft Excel in French locale.
 */

export interface CsvColumn<T = Record<string, unknown>> {
  key: keyof T | string;
  label: string;
  format?: (value: unknown, row: T) => string | number | null | undefined;
}

export interface CsvOptions {
  /**
   * Column delimiter. In French Excel, semicolon (;) is the standard delimiter
   * because comma is the decimal separator. Defaults to ';'.
   */
  delimiter?: string;
}

/**
 * Sanitizes a cell value to prevent CSV Formula Injection (OWASP).
 * If a value starts with =, +, -, @, \t, or \r, prepend a single quote (').
 * A plain signed number or amount (« -5,00 € », « -12,5 % ») is left alone: it cannot carry a
 * formula, and the quote would turn every negative amount of the export into text that Excel
 * will not add up.
 */
const PLAIN_SIGNED_NUMBER = /^[-+][\d\s\u00a0\u202f]*\d([.,]\d+)?[\s\u00a0\u202f]*(€|%)?$/;

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Strip formula injection triggers
  const firstChar = str.charAt(0);
  if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar) && !PLAIN_SIGNED_NUMBER.test(str)) {
    str = `'${str}`;
  }

  return str;
}

/**
 * Escapes a cell value for CSV output according to RFC 4180:
 * Encloses the cell in double quotes if it contains delimiters, quotes, or newlines.
 * Escapes existing quotes by doubling them (" -> "").
 */
export function escapeCsvCell(raw: string, delimiter: string = ';'): string {
  const needsQuotes =
    raw.includes(delimiter) ||
    raw.includes('"') ||
    raw.includes('\n') ||
    raw.includes('\r');

  if (needsQuotes) {
    return `"${raw.replace(/"/g, '""')}"`;
  }

  return raw;
}

/**
 * Generates an RFC 4180 compliant CSV string with UTF-8 BOM.
 */
export function generateCsv<T = Record<string, unknown>>(
  columns: CsvColumn<T>[],
  rows: T[],
  options: CsvOptions = {}
): string {
  const delimiter = options.delimiter ?? ';';

  // Header row
  const headerRow = columns
    .map((col) => escapeCsvCell(sanitizeCsvCell(col.label), delimiter))
    .join(delimiter);

  // Data rows
  const dataRows = rows.map((row) => {
    return columns
      .map((col) => {
        const rawValue = (row as Record<string, unknown>)[col.key as string];
        const formatted = col.format ? col.format(rawValue, row) : rawValue;
        const sanitized = sanitizeCsvCell(formatted);
        return escapeCsvCell(sanitized, delimiter);
      })
      .join(delimiter);
  });

  // UTF-8 BOM prefix (\uFEFF)
  return '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
}

/**
 * Triggers a client-side file download of CSV content in the browser.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
