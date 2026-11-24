import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';
import { AdminThemeProvider, useTheme, readStoredTheme, resolveTheme, THEME_STORAGE_KEY } from '../lib/theme';

let currentContext: ReturnType<typeof useTheme> | null = null;
let currentHtml = '';
let currentUi: React.ReactElement | null = null;

function render(ui: React.ReactElement) {
  currentUi = ui;
  currentHtml = renderToString(ui);
}

function rerender() {
  if (currentUi) {
    currentHtml = renderToString(currentUi);
  }
}

const screen = {
  getByTestId: (id: string) => ({
    get textContent() {
      const match = new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`).exec(currentHtml);
      return match ? match[1] : '';
    },
  }),
  getByText: (text: string) => ({
    text,
  }),
};

const userEvent = {
  setup: () => ({
    click: async (el: { text: string }) => {
      if (!currentContext) return;
      if (el.text === 'Set Dark') {
        currentContext.setTheme('dark');
      } else if (el.text === 'Set Light') {
        currentContext.setTheme('light');
      } else if (el.text === 'Set System') {
        currentContext.setTheme('system');
      }
      rerender();
    },
  }),
};

function TestConsumer() {
  const ctx = useTheme();
  React.useEffect(() => {
    currentContext = ctx;
  });
  // Also assign synchronously for SSR renderToString tests
  currentContext = ctx; // eslint-disable-line react-hooks/globals
  return (
    <div>
      <span data-testid="theme-val">{ctx.theme}</span>
      <span data-testid="resolved-val">{ctx.resolvedTheme}</span>
      <button onClick={() => ctx.setTheme('dark')}>Set Dark</button>
      <button onClick={() => ctx.setTheme('light')}>Set Light</button>
      <button onClick={() => ctx.setTheme('system')}>Set System</button>
    </div>
  );
}

describe('AdminThemeProvider and useTheme', () => {
  let store: Record<string, string> = {};
  let rootAttributes: Record<string, string> = {};
  let mediaListeners: Array<(e: { matches: boolean }) => void> = [];
  let mediaMatches = false;

  beforeEach(() => {
    store = {};
    rootAttributes = {};
    mediaListeners = [];
    mediaMatches = false;
    currentContext = null;
    currentHtml = '';
    currentUi = null;

    // Mock localStorage
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        store[key] = String(val);
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
    vi.stubGlobal('localStorage', mockLocalStorage);

    // Mock document.documentElement
    const mockDocument = {
      documentElement: {
        getAttribute: vi.fn((attr: string) => rootAttributes[attr] ?? null),
        setAttribute: vi.fn((attr: string, val: string) => {
          rootAttributes[attr] = String(val);
        }),
        removeAttribute: vi.fn((attr: string) => {
          delete rootAttributes[attr];
        }),
      },
    };
    vi.stubGlobal('document', mockDocument);

    // Mock window & matchMedia
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return mediaMatches;
        },
        media: query,
        onchange: null,
        addListener: vi.fn((cb: any) => mediaListeners.push(cb)),
        removeListener: vi.fn((cb: any) => {
          mediaListeners = mediaListeners.filter((l) => l !== cb);
        }),
        addEventListener: vi.fn((event: string, cb: any) => {
          if (event === 'change') mediaListeners.push(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: any) => {
          if (event === 'change') {
            mediaListeners = mediaListeners.filter((l) => l !== cb);
          }
        }),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders system / light on the first render whatever is stored, and never writes the DOM during render', () => {
    // Server and first client render must agree, or a returning dark-theme user hydrates
    // against HTML that says otherwise. The stored choice is read after mount.
    store[THEME_STORAGE_KEY] = 'dark';
    mediaMatches = true;
    render(
      <AdminThemeProvider>
        <TestConsumer />
      </AdminThemeProvider>
    );

    expect(screen.getByTestId('theme-val').textContent).toBe('system');
    expect(screen.getByTestId('resolved-val').textContent).toBe('light');
    expect(globalThis.document.documentElement.setAttribute).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem).not.toHaveBeenCalled();
  });

  it('setTheme persists the choice', () => {
    render(
      <AdminThemeProvider>
        <TestConsumer />
      </AdminThemeProvider>
    );

    currentContext!.setTheme('dark');
    expect(store[THEME_STORAGE_KEY]).toBe('dark');
    currentContext!.setTheme('system');
    expect(store[THEME_STORAGE_KEY]).toBe('system');
  });

  it('setTheme survives blocked storage', () => {
    (globalThis.localStorage.setItem as any).mockImplementation(() => {
      throw new Error('Access denied');
    });
    render(
      <AdminThemeProvider>
        <TestConsumer />
      </AdminThemeProvider>
    );
    expect(() => currentContext!.setTheme('dark')).not.toThrow();
  });

  it('readStoredTheme returns a stored mode, and null for nothing, garbage or blocked storage', () => {
    expect(readStoredTheme()).toBeNull();
    for (const mode of ['light', 'dark', 'system'] as const) {
      store[THEME_STORAGE_KEY] = mode;
      expect(readStoredTheme()).toBe(mode);
    }
    store[THEME_STORAGE_KEY] = 'sepia';
    expect(readStoredTheme()).toBeNull();
    (globalThis.localStorage.getItem as any).mockImplementation(() => {
      throw new Error('Access denied');
    });
    expect(readStoredTheme()).toBeNull();
  });

  it('resolveTheme: an explicit mode wins, system follows the media query', () => {
    mediaMatches = true;
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('system')).toBe('dark');
    mediaMatches = false;
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('system')).toBe('light');
  });

  it('throws an error when useTheme is called outside AdminThemeProvider', () => {
    function InvalidConsumer() {
      useTheme();
      return null;
    }

    expect(() => renderToString(<InvalidConsumer />)).toThrow(
      'useTheme must be used within an AdminThemeProvider'
    );
  });

  describe('RootLayout Anti-FOIT Script & Layout Integration', () => {
    const layoutPath = path.resolve(__dirname, '../app/layout.tsx');
    const layoutContent = fs.readFileSync(layoutPath, 'utf8');

    it('includes suppressHydrationWarning on html tag', () => {
      expect(layoutContent).toContain('suppressHydrationWarning');
    });

    it('contains the synchronous anti-FOIT script checking localStorage and matchMedia', () => {
      expect(layoutContent).toContain('revime-admin-theme');
      expect(layoutContent).toContain("prefers-color-scheme: dark");
      expect(layoutContent).toContain("setAttribute('data-theme'");
    });

    it('wraps the layout contents with AdminThemeProvider', () => {
      expect(layoutContent).toContain('<AdminThemeProvider>');
      expect(layoutContent).toContain('</AdminThemeProvider>');
      expect(layoutContent).toMatch(/import.*AdminThemeProvider.*from/);
    });
  });
});
