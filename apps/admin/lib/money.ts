/**
 * Unified Euro money and percentage formatting helpers (Feedback Round 6 UI6).
 *
 * Requirements:
 * - Amounts: "5 472,83 €" (standardized French currency with space thousands separator,
 *   comma decimal separator, and 2 decimal places).
 * - Percentages: "80,0 %" (French decimal comma and space before '%').
 * - Handles nullable / NaN inputs gracefully.
 */

const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT_FORMATTER = new Intl.NumberFormat('fr-FR');

/**
 * Formats an amount in cents into French standard Euro currency string (e.g. "5 472,83 €").
 *
 * @param cents Amount in integer cents (e.g. 547283 -> "5 472,83 €", 5000 -> "50,00 €", 2100 -> "21,00 €").
 * @param fallback String to return when cents is null, undefined, or NaN (defaults to '—').
 */
export function formatEuros(cents: number | null | undefined, fallback = '—'): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return fallback;
  }
  return EUR_FORMATTER.format(cents / 100);
}

/**
 * Formats a percentage number with 1 decimal place, French decimal comma, and space before % (e.g. "80,0 %").
 *
 * @param value Percentage number (e.g. 80 -> "80,0 %", 12.5 -> "12,5 %", -15 -> "-15,0 %").
 */
export function formatPercentage(value: number | null | undefined): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1).replace('.', ',')} %`;
}

/**
 * Formats an integer count with French thousands separators (e.g. 1 234 567).
 */
export function formatCount(value: number | null | undefined): string {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return COUNT_FORMATTER.format(safe);
}
