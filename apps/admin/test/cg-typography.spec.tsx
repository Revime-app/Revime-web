import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Google Sans Flex and 4-tier typography scale integration', () => {
  const adminRoot = path.resolve(__dirname, '..');
  const layoutPath = path.resolve(adminRoot, 'app/layout.tsx');
  const globalsCssPath = path.resolve(adminRoot, 'app/globals.css');

  describe('app/layout.tsx font loading configuration', () => {
    it('verifies layout.tsx exists', () => {
      expect(fs.existsSync(layoutPath), 'Expected layout.tsx to exist').toBe(true);
    });

    it('imports localFont from next/font/local', () => {
      const content = fs.readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/import\s+localFont\s+from\s+['"]next\/font\/local['"]/);
    });

    it('configures Google Sans Flex fonts with 4 weights (400, 500, 600, 700)', () => {
      const content = fs.readFileSync(layoutPath, 'utf-8');
      expect(content).toContain('GoogleSansFlex_400Regular.ttf');
      expect(content).toContain('GoogleSansFlex_500Medium.ttf');
      expect(content).toContain('GoogleSansFlex_600SemiBold.ttf');
      expect(content).toContain('GoogleSansFlex_700Bold.ttf');
    });

    it('sets font variable to --font-google-sans with Arial fallback', () => {
      const content = fs.readFileSync(layoutPath, 'utf-8');
      expect(content).toContain("variable: '--font-google-sans'");
      expect(content).toMatch(/fallback:\s*\[['"]Arial['"],\s*['"]sans-serif['"]\]/);
    });

    it('applies googleSansFlex.variable to the html element', () => {
      const content = fs.readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/<html[^>]*className=\{googleSansFlex\.variable\}/);
    });
  });

  describe('app/globals.css typography rules and tracking scale', () => {
    it('verifies globals.css exists', () => {
      expect(fs.existsSync(globalsCssPath), 'Expected globals.css to exist').toBe(true);
    });

    it('configures body font family with var(--font-google-sans), Arial, sans-serif and background var(--paper)', () => {
      const content = fs.readFileSync(globalsCssPath, 'utf-8');
      expect(content).toMatch(/font-family:\s*var\(--font-google-sans\),\s*Arial,\s*sans-serif/);
      expect(content).toMatch(/background:\s*var\(--paper\)/);
    });

    it('configures h1 and .title-page with -0.035em letter spacing', () => {
      const content = fs.readFileSync(globalsCssPath, 'utf-8');
      expect(content).toMatch(/h1[\s\S]*?letter-spacing:\s*-0\.035em/);
      expect(content).toMatch(/\.title-page[\s\S]*?letter-spacing:\s*-0\.035em/);
    });

    it('configures h2 and .title-section with -0.025em letter spacing', () => {
      const content = fs.readFileSync(globalsCssPath, 'utf-8');
      expect(content).toMatch(/h2[\s\S]*?letter-spacing:\s*-0\.025em/);
      expect(content).toMatch(/\.title-section[\s\S]*?letter-spacing:\s*-0\.025em/);
    });

    it('configures h3 and .title-card with -0.02em letter spacing', () => {
      const content = fs.readFileSync(globalsCssPath, 'utf-8');
      expect(content).toMatch(/h3[\s\S]*?letter-spacing:\s*-0\.02em/);
      expect(content).toMatch(/\.title-card[\s\S]*?letter-spacing:\s*-0\.02em/);
    });

    it('configures p and .text-body with -0.02em letter spacing (the charte floor, text level included)', () => {
      const content = fs.readFileSync(globalsCssPath, 'utf-8');
      expect(content).toMatch(/\.text-body,\s*p \{[^}]*letter-spacing:\s*-0\.02em/);
      expect(content).toContain('.text-muted');
    });
  });
});
