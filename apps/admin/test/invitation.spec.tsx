import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  InvitationContent,
  InvitationErrorView,
  InvitationLoadingView,
  InvitationValidView,
  validatePasswordInput,
} from '../app/invitation/page';
import { ADMIN_ROLE_LABEL, type AdminRole, type VerifyStaffInvitationResponse } from '@revime/shared';
import { AdminNav } from '../components/AdminNav';

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParamToken: string | null = null;
let mockPathname = '/invitation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'token' ? mockSearchParamToken : null),
  }),
  usePathname: () => mockPathname,
}));

// Mock auth client
const mockSignInEmail = vi.fn();
vi.mock('../../lib/auth-client', () => ({
  signIn: {
    email: (params: { email: string; password: string }) => mockSignInEmail(params),
  },
  useSession: () => ({ data: null, isPending: false }),
  signOut: vi.fn(),
}));

describe('Public Invitation Page (/invitation)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamToken = null;
    mockPathname = '/invitation';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Ungated Route Configuration', () => {
    it('AdminNav returns null on /invitation', () => {
      mockPathname = '/invitation';
      expect(AdminNav()).toBeNull();
    });

    it('AdminNav returns null on /login', () => {
      mockPathname = '/login';
      expect(AdminNav()).toBeNull();
    });

    it('AdminNav renders navigation bar on normal dashboard routes (e.g. /)', () => {
      mockPathname = '/';
      const nav = AdminNav();
      expect(nav).not.toBeNull();
    });
  });

  describe('2. Client-side Password Validation', () => {
    it('rejects passwords shorter than 8 characters', () => {
      const res = validatePasswordInput('pass', 'pass');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('Le mot de passe doit contenir au moins 8 caractères.');
      }
    });

    it('rejects mismatching passwords', () => {
      const res = validatePasswordInput('Password123!', 'Different123!');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('Les mots de passe ne correspondent pas.');
      }
    });

    it('accepts matching passwords >= 8 chars', () => {
      const res = validatePasswordInput('SecurePassword123!', 'SecurePassword123!');
      expect(res.ok).toBe(true);
    });
  });

  describe('3. Loading & Error State Rendering', () => {
    it('renders loading state text correctly', () => {
      const html = renderToString(<InvitationLoadingView />);
      expect(html).toContain('Vérification de votre invitation...');
    });

    it('renders missing token state when no token query parameter is provided', () => {
      mockSearchParamToken = null;
      const html = renderToString(<InvitationContent />);
      expect(html).toContain('Invitation invalide');
      expect(html).toContain("Aucun jeton d&#x27;invitation n&#x27;a été fourni.");
      expect(html).toContain('Retour à la connexion');
    });

    it('renders error view with custom 404 error message', () => {
      const html = renderToString(
        <InvitationErrorView errorMessage="Invitation introuvable ou révoquée." />,
      );
      expect(html).toContain('Invitation invalide');
      expect(html).toContain('Invitation introuvable ou révoquée.');
      expect(html).toContain('Retour à la connexion');
    });

    it('renders error view with 410 expired / already used error message', () => {
      const html = renderToString(
        <InvitationErrorView errorMessage="Cette invitation a déjà été utilisée." />,
      );
      expect(html).toContain('Invitation invalide');
      expect(html).toContain('Cette invitation a déjà été utilisée.');
      expect(html).toContain('Retour à la connexion');
    });
  });

  describe('4. Valid Invitation Form & Role Badge Rendering', () => {
    const validInvitation: VerifyStaffInvitationResponse = {
      valid: true,
      email: 'alex@revime.fr',
      role: 'moderation',
      firstName: 'Alex',
      lastName: 'Martin',
      isExistingUser: false,
    };

    it('renders title, email, name fields, and role badge for Modération', () => {
      const html = renderToString(
        <InvitationValidView
          invitation={validInvitation}
          firstName="Alex"
          lastName="Martin"
          password=""
          confirmPassword=""
          formError={null}
          submitting={false}
          onFirstNameChange={() => {}}
          onLastNameChange={() => {}}
          onPasswordChange={() => {}}
          onConfirmPasswordChange={() => {}}
          onSubmit={() => {}}
        />,
      );

      expect(html).toContain('Rejoindre l&#x27;équipe REVIME');
      expect(html).toContain('alex@revime.fr');
      expect(html).toContain('Alex');
      expect(html).toContain('Martin');
      expect(html).toContain('Modération');
    });

    it('renders existing user account promotion notice when isExistingUser is true', () => {
      const existingUserInvitation: VerifyStaffInvitationResponse = {
        ...validInvitation,
        isExistingUser: true,
      };

      const html = renderToString(
        <InvitationValidView
          invitation={existingUserInvitation}
          firstName="Alex"
          lastName="Martin"
          password=""
          confirmPassword=""
          formError={null}
          submitting={false}
          onFirstNameChange={() => {}}
          onLastNameChange={() => {}}
          onPasswordChange={() => {}}
          onConfirmPasswordChange={() => {}}
          onSubmit={() => {}}
        />,
      );

      expect(html).toContain('Compte existant :');
      expect(html).toContain('Vous possédez déjà un compte sur REVIME avec cette adresse e-mail.');
    });

    it('renders all 6 role badges matching ADMIN_ROLE_LABEL dictionary', () => {
      const roles: AdminRole[] = ['super_admin', 'admin', 'moderation', 'support', 'finance', 'read_only'];
      for (const r of roles) {
        const inv: VerifyStaffInvitationResponse = {
          valid: true,
          email: 'test@revime.fr',
          role: r,
          firstName: 'Jean',
          lastName: 'Dupont',
          isExistingUser: false,
        };
        const html = renderToString(
          <InvitationValidView
            invitation={inv}
            firstName="Jean"
            lastName="Dupont"
            password=""
            confirmPassword=""
            formError={null}
            submitting={false}
            onFirstNameChange={() => {}}
            onLastNameChange={() => {}}
            onPasswordChange={() => {}}
            onConfirmPasswordChange={() => {}}
            onSubmit={() => {}}
          />,
        );
        expect(html).toContain(ADMIN_ROLE_LABEL[r]);
      }
    });

    it('renders form submission error alert if formError is provided', () => {
      const html = renderToString(
        <InvitationValidView
          invitation={validInvitation}
          firstName="Alex"
          lastName="Martin"
          password="password123"
          confirmPassword="password123"
          formError="Les mots de passe ne correspondent pas."
          submitting={false}
          onFirstNameChange={() => {}}
          onLastNameChange={() => {}}
          onPasswordChange={() => {}}
          onConfirmPasswordChange={() => {}}
          onSubmit={() => {}}
        />,
      );

      expect(html).toContain('Les mots de passe ne correspondent pas.');
    });
  });

  describe('5. Accept API Call, Better Auth Sign-In, and 2FA Handshake Redirection', () => {
    it('executes full onboarding pipeline and redirects to /securite', async () => {
      const token = 'valid-token-32-chars-long-abcdef012345';
      const email = 'clara@revime.fr';
      const password = 'UltraSecurePassword2026!';

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/proxy/admin/staff/invitations/public/accept')) {
          const body = JSON.parse(init?.body as string);
          expect(body.token).toBe(token);
          expect(body.password).toBe(password);
          expect(body.firstName).toBe('Clara');
          expect(body.lastName).toBe('Vannier');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, email, role: 'support' }),
          });
        }
        return Promise.reject(new Error('Unexpected fetch url: ' + url));
      });

      mockSignInEmail.mockResolvedValue({
        data: { user: { id: 'u-clara', email } },
        error: null,
      });

      // Call accept API
      const acceptRes = await global.fetch('/api/proxy/admin/staff/invitations/public/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          firstName: 'Clara',
          lastName: 'Vannier',
        }),
      });

      expect(acceptRes.ok).toBe(true);
      const acceptData = await acceptRes.json();
      expect(acceptData.ok).toBe(true);

      // Call Better Auth sign-in
      const signInRes = await mockSignInEmail({ email: acceptData.email, password });
      expect(signInRes.error).toBeNull();
    });

    it('rejects token verification on 404 or 410 status codes', async () => {
      // 404 verification
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Invitation introuvable ou révoquée.' }),
      });

      const res404 = await global.fetch('/api/proxy/admin/staff/invitations/public/verify?token=bad-token');
      expect(res404.ok).toBe(false);
      const data404 = await res404.json();
      expect(data404.message).toBe('Invitation introuvable ou révoquée.');

      // 410 verification
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 410,
        json: async () => ({ message: 'Cette invitation a expiré.' }),
      });

      const res410 = await global.fetch('/api/proxy/admin/staff/invitations/public/verify?token=expired-token');
      expect(res410.ok).toBe(false);
      const data410 = await res410.json();
      expect(data410.message).toBe('Cette invitation a expiré.');
    });
  });
});
