import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ISS-122: 215 `<button type="button">` across 83 admin files carry no className. The global
// reset (`* { padding: 0 }`) strips the browser's padding, and only `type="submit"` and the
// `.button--*` classes were styled, so every class-less button (Se déconnecter, dialog and
// drawer actions) fell back to the UA's outset border with no padding. This is a stylesheet
// contract, read the way cg-colors-buttons-badges.spec.tsx reads it.
const css = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');

/** The declaration block of the rule whose selector list is exactly `selector`. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : '';
}

const BARE = ':where(button:not([class]))';

describe('ISS-122: class-less buttons get a real button look', () => {
  it('has a base rule for buttons without a class', () => {
    expect(block(BARE)).not.toBe('');
  });

  it('gives them the secondary look: paper fill, navy text, platinum border, padding', () => {
    const b = block(BARE);
    expect(b).toMatch(/background:\s*var\(--paper/);
    expect(b).toMatch(/color:\s*var\(--navy-text/);
    expect(b).toMatch(/border:\s*1px solid var\(--line/);
    expect(b).toMatch(/padding:\s*8px 16px/);
  });

  it('keeps the rule at zero specificity so any component class or the submit rule wins', () => {
    // `:where()` contributes nothing; a plain `button:not([class])` would be (0,1,1) and would
    // beat single-class component rules that set only `background` or `padding`.
    expect(css).not.toMatch(/(^|\n)\s*button:not\(\[class\]\)\s*\{/);
  });

  it('has a hover state that does not fire on a disabled button', () => {
    expect(block(`${BARE}:hover:not(:disabled)`)).toMatch(/background:\s*var\(--navy-soft/);
  });
});
