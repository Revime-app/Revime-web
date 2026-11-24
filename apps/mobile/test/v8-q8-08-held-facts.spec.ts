import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * V8 B2, `Q8-08`. A payout Revime is holding reads « Terminée » (client) or « Paiement en attente »
 * (réparateur) only if `repairStatus` is told `hasStripeTransfer`. Screens that pass the API's
 * `commande` object through get it for free; screens that BUILD the facts by hand (`commande: {`)
 * must copy the field, or they silently keep « Fonds versés ». This scan finds every hand-built call.
 */
const ROOT = path.resolve(__dirname, '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

/** The text of each `repairStatus(` call, up to its closing parenthesis. */
function repairStatusCalls(source: string): string[] {
  const calls: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf('repairStatus(', from);
    if (start === -1) return calls;
    let depth = 0;
    let end = start + 'repairStatus'.length;
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++;
      if (source[end] === ')' && --depth === 0) break;
    }
    calls.push(source.slice(start, end + 1));
    from = end + 1;
  }
}

describe('V8 Q8-08: every hand-built repairStatus commande carries hasStripeTransfer', () => {
  const handBuilt = [...tsxFiles(path.join(ROOT, 'app')), ...tsxFiles(path.join(ROOT, 'src'))].flatMap((file) =>
    repairStatusCalls(readFileSync(file, 'utf8'))
      .filter((call) => /commande:\s*\{/.test(call))
      .map((call) => ({ file: path.relative(ROOT, file), call })),
  );

  it('finds the hand-built calls (guards the scan itself)', () => {
    // CommandeHeaderCard, acceptee, and the réparateur half of « Mes réparations ».
    expect(handBuilt.length).toBeGreaterThanOrEqual(3);
  });

  it('passes hasStripeTransfer in each of them', () => {
    expect(handBuilt.filter((c) => !c.call.includes('hasStripeTransfer')).map((c) => c.file)).toEqual([]);
  });
});
