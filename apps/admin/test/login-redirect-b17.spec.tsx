import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import LoginPage, { getLoginViewState, redirectIfAuthenticated } from '../app/login/page';
import { AdminGate } from '../components/AdminGate';

// Mock next/navigation
const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = '/login';

vi.mock('next/image', () => ({
  default: ({ priority: _priority, ...props }: React.ComponentProps<'img'> & { priority?: boolean }) =>
    React.createElement('img', props),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  usePathname: () => mockPathname,
}));

// Mock auth-client
let mockSessionState: {
  data: { user: { id: string; email: string } } | null;
  isPending: boolean;
} = {
  data: null,
  isPending: false,
};

const mockSignInEmail = vi.fn();

vi.mock('../lib/auth-client', () => ({
  useSession: () => mockSessionState,
  signIn: {
    email: (params: { email: string; password: string }) => mockSignInEmail(params),
  },
  signOut: vi.fn(),
  twoFactor: {
    verifyTotp: vi.fn(),
    verifyBackupCode: vi.fn(),
  },
}));

describe('Bug B17: /login redirect when already authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/login';
    mockSessionState = {
      data: null,
      isPending: false,
    };
  });

  describe('1. Pure helper: getLoginViewState', () => {
    it('returns "loading" when isPending is true regardless of session', () => {
      expect(getLoginViewState(null, true, false)).toBe('loading');
      expect(getLoginViewState({ user: { id: '1' } }, true, false)).toBe('loading');
    });

    it('returns "redirecting" when session exists and not pending', () => {
      expect(getLoginViewState({ user: { id: 'admin-1' } }, false, false)).toBe('redirecting');
      expect(getLoginViewState({ user: { id: 'admin-1' } }, false, true)).toBe('redirecting');
    });

    it('returns "two-factor" when unauthenticated, not pending, and needsCode is true', () => {
      expect(getLoginViewState(null, false, true)).toBe('two-factor');
    });

    it('returns "form" when unauthenticated, not pending, and needsCode is false', () => {
      expect(getLoginViewState(null, false, false)).toBe('form');
    });
  });

  describe('2. LoginPage Component Rendering & Accessibility', () => {
    it('renders login form when unauthenticated (isPending: false, data: null)', () => {
      mockSessionState = {
        data: null,
        isPending: false,
      };

      const html = renderToString(<LoginPage />);

      // Should display login heading and form
      expect(html).toContain('Tableau de bord Revime');
      expect(html).toContain('Accès réservé à l&#x27;équipe Revime.');
      expect(html).toContain('Adresse e-mail');
      expect(html).toContain('Mot de passe');
      expect(html).toContain('Se connecter');
      expect(html).not.toContain('Redirection vers le tableau de bord...');
      expect(html).not.toContain('Chargement...');

      // Should NOT redirect
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does NOT render login form while session is loading (isPending: true) and announces status', () => {
      mockSessionState = {
        data: null,
        isPending: true,
      };

      const html = renderToString(<LoginPage />);

      // Must NOT render login form during initial session resolution
      expect(html).not.toContain('Adresse e-mail');
      expect(html).not.toContain('Mot de passe');
      expect(html).not.toContain('Se connecter');
      expect(html).toContain('Chargement...');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).not.toContain('Redirection vers le tableau de bord...');

      // Should NOT redirect while session is unresolved
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does NOT render login form and displays redirecting state with live region when already authenticated', () => {
      mockSessionState = {
        data: { user: { id: 'admin-42', email: 'admin@revime.fr' } },
        isPending: false,
      };

      const html = renderToString(<LoginPage />);

      // Must NOT render login form to an authenticated user
      expect(html).not.toContain('Adresse e-mail');
      expect(html).not.toContain('Mot de passe');
      expect(html).not.toContain('Se connecter');
      expect(html).not.toContain('Chargement...');
      expect(html).toContain('Redirection vers le tableau de bord...');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
    });
  });

  describe('3. Pure Redirection Helper: redirectIfAuthenticated', () => {
    it('triggers router.replace("/") and returns true when session is authenticated and not pending', () => {
      const mockSession = { user: { id: 'admin-42', email: 'admin@revime.fr' } };
      const router = { replace: mockReplace, push: mockPush };

      const didRedirect = redirectIfAuthenticated(mockSession, false, router);

      expect(didRedirect).toBe(true);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });

    it('returns false and does not redirect when unauthenticated', () => {
      const router = { replace: mockReplace, push: mockPush };

      const didRedirect = redirectIfAuthenticated(null, false, router);

      expect(didRedirect).toBe(false);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('returns false and does not redirect while session check is pending', () => {
      const mockSession = { user: { id: 'admin-42', email: 'admin@revime.fr' } };
      const router = { replace: mockReplace, push: mockPush };

      const didRedirect = redirectIfAuthenticated(mockSession, true, router);

      expect(didRedirect).toBe(false);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('4. AdminGate Integration with /login', () => {
    it('AdminGate passes through children on /login without redirecting unauthenticated visitors', () => {
      mockPathname = '/login';
      mockSessionState = {
        data: null,
        isPending: false,
      };

      const html = renderToString(
        <AdminGate>
          <div data-testid="child-page">Login Child</div>
        </AdminGate>,
      );

      expect(html).toContain('data-testid="child-page"');
      expect(html).toContain('Login Child');
    });

    it('AdminGate passes through redirecting child on /login when authenticated without rendering layout loader', () => {
      mockPathname = '/login';
      mockSessionState = {
        data: { user: { id: 'admin-42', email: 'admin@revime.fr' } },
        isPending: false,
      };

      const html = renderToString(
        <AdminGate>
          <div data-testid="authenticated-redirecting">Redirection...</div>
        </AdminGate>,
      );

      expect(html).toContain('data-testid="authenticated-redirecting"');
      expect(html).toContain('Redirection...');
      // Must not render layout error or gate checking loader
      expect(html).not.toContain('Accès réservé');
    });

    it('AdminGate passes through children on /invitation without redirecting', () => {
      mockPathname = '/invitation';
      mockSessionState = {
        data: null,
        isPending: false,
      };

      const html = renderToString(
        <AdminGate>
          <div data-testid="invitation-child">Invitation Child</div>
        </AdminGate>,
      );

      expect(html).toContain('data-testid="invitation-child"');
      expect(html).toContain('Invitation Child');
    });
  });
});
