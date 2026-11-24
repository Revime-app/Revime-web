import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette } from '@revime/tokens';
import { buildPaymentSheetParams } from '../src/components/payment/payment-params';
import { APP_STATUS_BAR_STYLE, splashStatusBarStyle } from '../src/lib/status-bar';

/**
 * V8 B1. On Android the app is NOT pinned light (`userInterfaceStyle` needs `expo-system-ui`, which
 * is not installed, FND8-011), so anything without an explicit colour follows the phone's theme.
 * The PaymentSheet never received `componentText`, so in dark mode the typed card number kept
 * Stripe's dark default (white) on our white field (FND8-010, reproduced on the emulator).
 */
describe('V8 B1: the PaymentSheet looks the same in light and dark mode', () => {
  const params = buildPaymentSheetParams({
    clientSecret: 'pi_test_123_secret_456',
    accentColor: '#f61b39',
    palette,
    radii: { field: 12 },
    isTestMode: true,
  });
  const colors = params.appearance.colors as { light: Record<string, string>; dark: Record<string, string> };

  it('passes an explicit light set AND an explicit dark set, and they are identical', () => {
    expect(colors.light).toBeDefined();
    expect(colors.dark).toBeDefined();
    expect(colors.dark).toEqual(colors.light);
  });

  it('colours the typed text (componentText), the key whose absence made it white in dark mode', () => {
    expect(colors.light.componentText).toBe('#010524');
    expect(colors.dark.componentText).toBe('#010524');
  });

  it("uses the client's values: text #010524, white background, borders #DFE2E2", () => {
    for (const set of [colors.light, colors.dark]) {
      expect(set.primaryText).toBe('#010524');
      expect(set.background.toLowerCase()).toBe('#ffffff');
      expect(set.componentBackground.toLowerCase()).toBe('#ffffff');
      expect(set.componentBorder.toLowerCase()).toBe('#dfe2e2');
    }
  });

  it('gives the primary button the same colours in both modes', () => {
    const button = params.appearance.primaryButton.colors as {
      light: Record<string, string>;
      dark: Record<string, string>;
    };
    expect(button.light).toBeDefined();
    expect(button.dark).toEqual(button.light);
    expect(button.light.text).toBe(palette.paper);
  });
});

const ROOT = path.resolve(__dirname, '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

describe('V8 B1: no app text field takes its colours from the phone theme', () => {
  const files = [...tsxFiles(path.join(ROOT, 'app')), ...tsxFiles(path.join(ROOT, 'src'))];
  const inputs = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const blocks = source.match(/<TextInput\b[\s\S]*?\/>/g) ?? [];
    return blocks.map((block) => ({ file: path.relative(ROOT, file), block }));
  });

  it('finds the app text fields (guards the scan itself)', () => {
    expect(inputs.length).toBeGreaterThanOrEqual(16);
  });

  it('sets placeholderTextColor on every TextInput, or Android dark mode draws a light placeholder on white', () => {
    const missing = inputs.filter((i) => !i.block.includes('placeholderTextColor')).map((i) => i.file);
    expect(missing).toEqual([]);
  });
});

describe('V8 B1 (FND8-013): the Android status bar stays readable in dark mode', () => {
  it('draws dark icons over the app, whose screens are always light', () => {
    expect(APP_STATUS_BAR_STYLE).toBe('dark');
  });

  it('draws light icons over the navy startup splash shown in dark mode, dark ones otherwise', () => {
    expect(splashStatusBarStyle('dark')).toBe('light');
    expect(splashStatusBarStyle('light')).toBe('dark');
    expect(splashStatusBarStyle(null)).toBe('dark');
    expect(splashStatusBarStyle(undefined)).toBe('dark');
  });

  it('renders the app status bar in the root layout and the splash one in the splash', () => {
    const layout = readFileSync(path.join(ROOT, 'app/_layout.tsx'), 'utf8');
    expect(layout).toMatch(/<StatusBar\s+style=\{APP_STATUS_BAR_STYLE\}/);
    const splash = readFileSync(path.join(ROOT, 'src/components/lottie/RevimeStartupSplash.tsx'), 'utf8');
    expect(splash).toMatch(/<StatusBar\s+style=\{splashStatusBarStyle\(/);
  });
});
