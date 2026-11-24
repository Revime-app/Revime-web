import { describe, it, expect } from 'vitest';
import { semanticBadges } from '../src/index.js';
import { tokensCss } from '../src/css.js';

describe('Semantic Badge Tokens', () => {
  it('defines the functional semantic badge color sets with WCAG contrast', () => {
    expect(semanticBadges.success.text).toBe('#027a48');
    expect(semanticBadges.success.bg).toBe('#ecfdf3');
    expect(semanticBadges.success.border).toBe('#a6f4c5');

    expect(semanticBadges.warning.text).toBe('#b54708');
    expect(semanticBadges.warning.bg).toBe('#fffaeb');
    expect(semanticBadges.warning.border).toBe('#fedf89');

    expect(semanticBadges.info.text).toBe('#1d4ed8');
    expect(semanticBadges.info.bg).toBe('#eff6ff');
    expect(semanticBadges.info.border).toBe('#bfdbfe');

    expect(semanticBadges.danger.text).toBe('#b42318');
    expect(semanticBadges.danger.bg).toBe('#fef3f2');
    expect(semanticBadges.danger.border).toBe('#fecdca');

    expect(semanticBadges.neutral.text).toBe('#344054');
    expect(semanticBadges.neutral.bg).toBe('#f8f9fa');
    expect(semanticBadges.neutral.border).toBe('#eaecf0');
  });

  it('serializes semantic badge variables in tokensCss', () => {
    const css = tokensCss('pro');
    expect(css).toContain('--badge-success-text: #027a48;');
    expect(css).toContain('--badge-success-bg: #ecfdf3;');
    expect(css).toContain('--badge-success-border: #a6f4c5;');

    expect(css).toContain('--badge-warning-text: #b54708;');
    expect(css).toContain('--badge-warning-bg: #fffaeb;');
    expect(css).toContain('--badge-warning-border: #fedf89;');

    expect(css).toContain('--badge-info-text: #1d4ed8;');
    expect(css).toContain('--badge-info-bg: #eff6ff;');
    expect(css).toContain('--badge-info-border: #bfdbfe;');

    expect(css).toContain('--badge-danger-text: #b42318;');
    expect(css).toContain('--badge-danger-bg: #fef3f2;');
    expect(css).toContain('--badge-danger-border: #fecdca;');

    expect(css).toContain('--badge-neutral-text: #344054;');
    expect(css).toContain('--badge-neutral-bg: #f8f9fa;');
    expect(css).toContain('--badge-neutral-border: #eaecf0;');
  });
});
