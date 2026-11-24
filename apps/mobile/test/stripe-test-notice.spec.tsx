import * as Clipboard from 'expo-clipboard';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(),
}));

// The REAL tokens (no hand-typed palette): the banner must be legible with the colours the app ships.
vi.mock('../src/theme', async () => {
  const tokens = await vi.importActual<typeof import('@revime/tokens')>('@revime/tokens');
  return {
    useTheme: () => ({ palette: tokens.palette, radii: tokens.radii, spacing: tokens.spacing }),
  };
});

import { palette } from '@revime/tokens';
import { StripeTestModeNotice } from '../src/components/payment/StripeTestModeNotice';
import { createHookHarness } from './hook-harness';

function mount() {
  const reset = createHookHarness();
  const render = () => {
    reset();
    return StripeTestModeNotice() as any;
  };
  return Object.assign(render, { unmount: reset.unmount });
}

function walk(node: any, visit: (n: any) => void) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  visit(node);
  walk(node.props?.children, visit);
}

function textOf(tree: any): string {
  const out: string[] = [];
  const collect = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') out.push(String(n));
    else if (Array.isArray(n)) n.forEach(collect);
    else if (n && typeof n === 'object') collect(n.props?.children);
  };
  collect(tree);
  return out.join(' ');
}

function copyButton(tree: any): any {
  let found: any;
  walk(tree, (n) => {
    if (n.props?.accessibilityRole === 'button') found = n;
  });
  return found;
}

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('StripeTestModeNotice (CF6-07)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(Clipboard.setStringAsync).mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says it is test mode, warns that a REAL card is refused, and lists the three test cards', () => {
    const text = textOf(mount()());
    expect(text).toContain('Mode test actif');
    expect(text).toContain('vraie carte');
    expect(text).toContain('4242 4242 4242 4242');
    expect(text).toContain('4000 0027 6000 3184');
    expect(text).toContain('4000 0000 0000 0002');
  });

  it('uses no emoji or check-mark glyph, which Google Sans Flex cannot draw', () => {
    const text = textOf(mount()());
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}✓✔✅]/u);
  });

  it('keeps its badge legible (AA, 4.5:1) with the shipped palette', () => {
    const tree = mount()();
    let badge: any;
    walk(tree, (n) => {
      if (typeof n.props?.children === 'string' && n.props.children.includes('Mode test actif')) badge = n;
    });
    const style = Object.assign({}, ...[badge.props.style].flat());
    expect(contrast(style.color, palette.amberSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it('copies the success card, confirms it, then goes back to « Copier » after 2.5 s', async () => {
    const render = mount();
    await copyButton(render()).props.onPress();

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('4242424242424242');
    expect(textOf(render())).toContain('Numéro copié');

    vi.advanceTimersByTime(2_500);
    expect(textOf(render())).toContain('Copier le numéro');
  });

  it('says so when the clipboard refuses, instead of failing silently', async () => {
    vi.mocked(Clipboard.setStringAsync).mockRejectedValue(new Error('denied'));
    const render = mount();

    await copyButton(render()).props.onPress();

    expect(textOf(render())).toContain('Copie impossible');
  });

  it('cancels its reset timer when it leaves the screen', async () => {
    const render = mount();
    await copyButton(render()).props.onPress();
    const pending = vi.getTimerCount();

    render.unmount();

    expect(pending).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
