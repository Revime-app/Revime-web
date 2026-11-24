import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ISS-126: checkboxes and radios across the admin (27 of them: Réglages delivery modes and
// carriers, « Nécessite une action », « Litiges uniquement », « Déconnecter les autres
// appareils », the broadcast channels...) had a wide gap between box and label, and labels wrapped
// into narrow columns. The global `input { width: 100%; padding: 12px 16px }` rule is meant for text
// fields and also hit them: the box took the whole row (or, with an inline 16px width, kept 32px of
// padding), and the label text was squeezed beside it.
const css = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : '';
}

const CHOICE = 'input[type="checkbox"],\ninput[type="radio"]';

describe('ISS-126: checkboxes and radios are not sized like text fields', () => {
  const b = block(CHOICE);

  it('has a rule for checkboxes and radios', () => {
    expect(b).not.toBe('');
  });

  it('gives them a fixed box, not the text-field width', () => {
    expect(b).toMatch(/width:\s*16px/);
    expect(b).toMatch(/height:\s*16px/);
  });

  it('removes the text-field padding and margin that created the gap', () => {
    expect(b).toMatch(/padding:\s*0\b/);
    expect(b).toMatch(/margin:\s*0\b/);
  });

  it('never lets a flex row shrink or grow the box', () => {
    expect(b).toMatch(/flex:\s*none/);
  });

  it('colours the tick with the navy token and shows a pointer', () => {
    expect(b).toMatch(/accent-color:\s*var\(--navy/);
    expect(b).toMatch(/cursor:\s*pointer/);
  });

  it('keeps a disabled choice looking disabled', () => {
    expect(block('input[type="checkbox"]:disabled,\ninput[type="radio"]:disabled')).toMatch(
      /cursor:\s*not-allowed/,
    );
  });

  it('comes after the generic input rule, so equal-or-lower specificity cannot undo it', () => {
    // `input[type=…]` is (0,1,1) against `input` (0,0,1); the order is a second guard.
    expect(css.indexOf('input[type="checkbox"]')).toBeGreaterThan(css.indexOf('\ninput {'));
  });

  it('takes the 6px label margin off a label that wraps a choice, which would misalign a row', () => {
    const l = block('label:has(input[type="checkbox"]),\nlabel:has(input[type="radio"])');
    expect(l).toMatch(/margin-bottom:\s*0/);
  });
});
