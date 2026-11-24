import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Brand assets and fonts', () => {
  const adminRoot = path.resolve(__dirname, '..');

  const requiredFonts = [
    'public/fonts/GoogleSansFlex_400Regular.ttf',
    'public/fonts/GoogleSansFlex_500Medium.ttf',
    'public/fonts/GoogleSansFlex_600SemiBold.ttf',
    'public/fonts/GoogleSansFlex_700Bold.ttf',
  ];

  const requiredBrandImages = [
    'public/brand/revime-logo-login.png',
    'public/brand/revime-emblem.png',
    'app/icon.png',
  ];

  describe('Google Sans Flex font assets', () => {
    it.each(requiredFonts)('verifies font file exists and is non-empty: %s', (relPath) => {
      const fullPath = path.resolve(adminRoot, relPath);
      expect(fs.existsSync(fullPath), `Expected ${relPath} to exist`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size, `Expected ${relPath} to be non-empty`).toBeGreaterThan(0);
    });
  });

  describe('Brand logo & icon assets', () => {
    it.each(requiredBrandImages)('verifies image file exists and is non-empty: %s', (relPath) => {
      const fullPath = path.resolve(adminRoot, relPath);
      expect(fs.existsSync(fullPath), `Expected ${relPath} to exist`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size, `Expected ${relPath} to be non-empty`).toBeGreaterThan(0);
    });
  });
});
