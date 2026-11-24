import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CG-8 Dark Mode Styles and Zero Black Buttons Rule', () => {
  const cssPath = path.resolve(__dirname, '../app/globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('globals.css uses CSS variables for .header background and border', () => {
    // .header must use var(--paper) and var(--line) and not have hardcoded background: #ffffff
    const headerBlockMatch = css.match(/\.header\s*\{([^}]+)\}/);
    expect(headerBlockMatch).not.toBeNull();
    const headerRules = headerBlockMatch![1];
    expect(headerRules).toContain('background: var(--paper');
    expect(headerRules).toContain('border-bottom: 1px solid var(--line');
    expect(headerRules).not.toContain('background: #ffffff');
  });

  it('globals.css uses CSS variables for .header__search-dropdown and search links', () => {
    const dropdownMatch = css.match(/\.header__search-dropdown\s*\{([^}]+)\}/);
    expect(dropdownMatch).not.toBeNull();
    const dropdownRules = dropdownMatch![1];
    expect(dropdownRules).toContain('background: var(--paper');
    expect(dropdownRules).toContain('border: 1px solid var(--line');

    const searchGroupMatch = css.match(/\.header__search-group\s*\+\s*\.header__search-group\s*\{([^}]+)\}/);
    expect(searchGroupMatch).not.toBeNull();
    expect(searchGroupMatch![1]).toContain('border-top: 1px solid var(--line');

    const searchHoverMatch = css.match(/\.header__search-link:hover\s*\{([^}]+)\}/);
    expect(searchHoverMatch).not.toBeNull();
    expect(searchHoverMatch![1]).toContain('background-color: var(--navy-soft');
  });

  it('globals.css uses CSS variables for .header__logout-btn', () => {
    const logoutMatch = css.match(/\.header__logout-btn\s*\{([^}]+)\}/);
    expect(logoutMatch).not.toBeNull();
    expect(logoutMatch![1]).toContain('border: 1px solid var(--line');

    const logoutHoverMatch = css.match(/\.header__logout-btn:hover\s*\{([^}]+)\}/);
    expect(logoutHoverMatch).not.toBeNull();
    const logoutHoverRules = logoutHoverMatch![1];
    expect(logoutHoverRules).toContain('background: var(--red-soft');
    expect(logoutHoverRules).toContain('border-color: var(--red');
  });

  it('declares dark theme floating surfaces and table row hover rules', () => {
    expect(css).toContain(':root[data-theme="dark"] .drawer');
    expect(css).toContain(':root[data-theme="dark"] .modal');
    expect(css).toContain(':root[data-theme="dark"] .header__search-dropdown');
    expect(css).toContain(':root[data-theme="dark"] .alert-bell-popover');
    expect(css).toContain(':root[data-theme="dark"] .table tr:hover td');

    const darkSurfaceMatch = css.match(/:root\[data-theme="dark"\]\s+\.drawer[^{]*\{([^}]+)\}/);
    expect(darkSurfaceMatch).not.toBeNull();
    const darkSurfaceRules = darkSurfaceMatch![1];
    expect(darkSurfaceRules).toContain('box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5)');
    expect(darkSurfaceRules).toContain('border: 1px solid var(--line)');

    const darkTableMatch = css.match(/:root\[data-theme="dark"\]\s+\.table\s+tr:hover\s+td\s*\{([^}]+)\}/);
    expect(darkTableMatch).not.toBeNull();
    expect(darkTableMatch![1]).toContain('background-color: var(--navy-soft)');
  });

  it('strictly enforces Zero Black Buttons across light and dark CSS rules', () => {
    // Check for black buttons: background: #000000, #141414, #111827, black on button selectors
    const blackButtonRegex = /(?:button|\.button)[^{]*\{[^}]*background(?:-color)?:\s*(?:#000(?:000)?|#141414|#111827|black)/gi;
    const matches = css.match(blackButtonRegex);
    expect(matches).toBeNull();
  });
});
