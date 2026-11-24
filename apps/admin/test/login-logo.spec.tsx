import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Admin /login Brand Logo & Favicon Metadata', () => {
  const loginPath = path.resolve(__dirname, '../app/login/page.tsx');
  const layoutPath = path.resolve(__dirname, '../app/layout.tsx');
  const loginContent = fs.readFileSync(loginPath, 'utf8');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  it('renders the compact bicolor logo on /login with proper dimensions and alt text', () => {
    expect(loginContent).toContain('revime-logo-login.png');
    expect(loginContent).toContain('alt="REVIME"');
    // Verify width meets or exceeds client minimum 128px
    expect(loginContent).toMatch(/width=\{1[2-9]\d\}/);
  });

  it('renders the logo through one LoginLogo component on both views, seated on the dark-theme tile', () => {
    expect(loginContent.match(/<LoginLogo \/>/g)).toHaveLength(2);
    expect(loginContent.match(/<Image/g)).toHaveLength(1);
    expect(loginContent).toContain('className="login-logo"');
    const css = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');
    expect(css).toMatch(/:root\[data-theme="dark"\] \.login-logo \{[^}]*background: #ffffff/);
  });

  it('leaves no stale favicon.ico beside the emblem (the old logo was still served to browsers that ask for it)', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../app/favicon.ico'))).toBe(false);
  });

  it('configures favicon and apple-touch-icon in layout metadata', () => {
    expect(layoutContent).toContain('icons:');
    expect(layoutContent).toContain('revime-emblem.png');
  });
});
