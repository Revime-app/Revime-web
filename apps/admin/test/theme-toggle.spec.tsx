import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminThemeProvider, THEME_STORAGE_KEY } from '../lib/theme';
import { ThemeToggle, CYCLE_ORDER } from '../components/ThemeToggle';
import { AdminHeader } from '../components/AdminHeader';

// Mock next/navigation for AdminHeader
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Mock auth-client for AdminHeader
vi.mock('../lib/auth-client', () => ({
  useSession: () => ({ data: { user: { name: 'Admin Test', email: 'admin@revime.fr' } } }),
  signOut: vi.fn(),
}));

// Mock AdminGate for AdminHeader
vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({ role: 'super_admin' }),
}));

describe('ThemeToggle component', () => {
  let store: Record<string, string> = {};
  let rootAttributes: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    rootAttributes = {};
    mockPathname = '/';

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

    const mockWindow = {
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    };
    vi.stubGlobal('window', mockWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders default system state with accessible attributes', () => {
    const html = renderToString(
      <AdminThemeProvider>
        <ThemeToggle />
      </AdminThemeProvider>
    );

    expect(html).toContain('data-testid="admin-theme-toggle"');
    expect(html).toContain('class="theme-toggle-btn"');
    expect(html).toContain('aria-label="Changer le thème d&#x27;affichage (actuellement : Système)"');
    expect(html).toContain('lucide-monitor');
    expect(html).toContain('Thème sélectionné : Système');
  });

  it('renders light mode state when theme is light', () => {
    // The provider reads the stored choice after mount (a render-time read hydrated against
    // the server's `system`), so the stored-choice rendering is driven through the props.
    const html = renderToString(<ThemeToggle theme="light" resolvedTheme="light" setTheme={() => {}} />);

    expect(html).toContain('data-testid="admin-theme-toggle"');
    expect(html).toContain('aria-label="Changer le thème d&#x27;affichage (actuellement : Clair)"');
    expect(html).toContain('lucide-sun');
    expect(html).toContain('Thème sélectionné : Clair');
  });

  it('renders dark mode state when theme is dark', () => {
    // The provider reads the stored choice after mount (a render-time read hydrated against
    // the server's `system`), so the stored-choice rendering is driven through the props.
    const html = renderToString(<ThemeToggle theme="dark" resolvedTheme="dark" setTheme={() => {}} />);

    expect(html).toContain('data-testid="admin-theme-toggle"');
    expect(html).toContain('aria-label="Changer le thème d&#x27;affichage (actuellement : Sombre)"');
    expect(html).toContain('lucide-moon');
    expect(html).toContain('Thème sélectionné : Sombre');
  });

  it('defines correct cycle transitions system -> light -> dark -> system', () => {
    expect(CYCLE_ORDER.system).toBe('light');
    expect(CYCLE_ORDER.light).toBe('dark');
    expect(CYCLE_ORDER.dark).toBe('system');
  });

  it('provides graceful fallback when rendered outside AdminThemeProvider', () => {
    // Standalone render without AdminThemeProvider must not throw
    let html = '';
    expect(() => {
      html = renderToString(<ThemeToggle />);
    }).not.toThrow();

    expect(html).toContain('data-testid="admin-theme-toggle"');
    expect(html).toContain('aria-label="Changer le thème d&#x27;affichage (actuellement : Système)"');
    expect(html).toContain('lucide-monitor');
    expect(html).toContain('Thème sélectionné : Système');
  });

  it('mounts ThemeToggle inside AdminHeader right before AdminAlertBell', () => {
    const html = renderToString(
      <AdminThemeProvider>
        <AdminHeader />
      </AdminThemeProvider>
    );

    const toggleIndex = html.indexOf('data-testid="admin-theme-toggle"');
    const bellIndex = html.indexOf('admin-alert-bell');
    const profileIndex = html.indexOf('header__profile');

    expect(toggleIndex).toBeGreaterThan(-1);
    expect(bellIndex).toBeGreaterThan(-1);
    expect(profileIndex).toBeGreaterThan(-1);

    // ThemeToggle appears before AdminAlertBell, which appears before header__profile
    expect(toggleIndex).toBeLessThan(bellIndex);
    expect(bellIndex).toBeLessThan(profileIndex);
  });

  it('mounts inside AdminHeader without crashing in isolated test harnesses without AdminThemeProvider', () => {
    const html = renderToString(<AdminHeader />);

    expect(html).toContain('data-testid="admin-theme-toggle"');
    expect(html).toContain('admin-alert-bell');
    expect(html).toContain('header__profile');
  });

  it('strictly adheres to Zero Black Buttons Rule', () => {
    const html = renderToString(
      <AdminThemeProvider>
        <ThemeToggle />
      </AdminThemeProvider>
    );

    expect(html).toContain('background:var(--paper)');
    expect(html).toContain('border:1px solid var(--line)');
    expect(html).not.toContain('#000000');
    expect(html).not.toContain('#141414');
    expect(html).not.toContain('background:black');
    expect(html).not.toContain('background-color:black');
  });
});
