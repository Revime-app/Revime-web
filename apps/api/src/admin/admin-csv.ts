/**
 * One CSV cell, RFC 4180. HERE rather than on a service because F5 (payouts) and F6 (exports) each
 * carried a verbatim copy of it, and a fix to one (RU-25 added the tab and carriage-return starters)
 * would have missed the other.
 */
export function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  let str = typeof val === 'string' ? val : String(val);
  // Formula injection (OWASP CSV injection): Excel and Numbers evaluate a cell that starts with
  // = + - @, and also with a tab or a carriage return, which some versions skip before evaluating.
  if (str.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(str.charAt(0))) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
