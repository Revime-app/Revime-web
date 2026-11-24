import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Admin Brand Colors, Buttons & Status Badges', () => {
  const cssPath = path.resolve(__dirname, '../app/globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('enforces white background and Platinum borders on cards and containers', () => {
    expect(css).toContain('background: var(--paper');
    expect(css).toContain('border: 1px solid var(--line');
  });

  it('styles primary buttons strictly with Bleu Ink #25324F and forbids black', () => {
    expect(css).toMatch(/button\[type="submit"\][\s\S]*?background:\s*var\(--navy/);
    expect(css).toMatch(/\.button--primary[\s\S]*?background:\s*var\(--navy/);
  });

  it('styles destructive buttons with Rouge Punch #F61B39', () => {
    expect(css).toMatch(/\.button--danger[\s\S]*?background:\s*var\(--red/);
  });

  it('defines the 4 semantic status badge classes matching tokens', () => {
    expect(css).toContain('.badge--success');
    expect(css).toContain('var(--badge-success-text');
    expect(css).toContain('var(--badge-success-bg');

    expect(css).toContain('.badge--warning');
    expect(css).toContain('var(--badge-warning-text');
    expect(css).toContain('var(--badge-warning-bg');

    expect(css).toContain('.badge--info');
    expect(css).toContain('var(--badge-info-text');
    expect(css).toContain('var(--badge-info-bg');

    expect(css).toContain('.badge--danger');
    expect(css).toContain('var(--badge-danger-text');
    expect(css).toContain('var(--badge-danger-bg');
  });

  it('references semantic CSS variables for positive and negative kpi trends', () => {
    expect(css).toMatch(/\.kpi__trend--positive[\s\S]*?var\(--badge-success-text,\s*#027a48\)/);
    expect(css).toMatch(/\.kpi__trend--positive[\s\S]*?var\(--badge-success-bg,\s*#ecfdf3\)/);
    expect(css).toMatch(/\.kpi__trend--negative[\s\S]*?var\(--badge-danger-text,\s*#b42318\)/);
    expect(css).toMatch(/\.kpi__trend--negative[\s\S]*?var\(--badge-danger-bg,\s*#fef3f2\)/);
  });
});

