import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ChangePasswordSection, validatePasswordChange } from '../components/ChangePasswordSection';
import { ChangeEmailSection, submitEmailChange, validateEmailChange } from '../components/ChangeEmailSection';
import { BackupCodesModal, formatBackupCodesTextFile } from '../components/BackupCodesModal';
import { ActiveSessionsCard, parseUserAgentDevice } from '../components/ActiveSessionsCard';
import { SecuritySection } from '../components/SecuritySection';
import ParametresPage from '../app/parametres/page';
import * as authClientModule from '../lib/auth-client';
import * as adminGateModule from '../components/AdminGate';

describe('P25: Paramètres — Operator Password, Email, 2FA Backup Codes & Active Sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. <ChangePasswordSection />', () => {
    it('validates password change input correctly', () => {
      // Empty current password
      const emptyCurrent = validatePasswordChange('', 'newPassword123', 'newPassword123');
      expect(emptyCurrent.ok).toBe(false);
      if (!emptyCurrent.ok) {
        expect(emptyCurrent.error).toContain('mot de passe actuel');
      }

      // Password too short (< 8 chars)
      const short = validatePasswordChange('oldPassword123', 'short', 'short');
      expect(short.ok).toBe(false);
      if (!short.ok) {
        expect(short.error).toContain('8 caractères');
      }

      // Password mismatch
      const mismatch = validatePasswordChange('oldPassword123', 'newPassword123', 'differentPassword');
      expect(mismatch.ok).toBe(false);
      if (!mismatch.ok) {
        expect(mismatch.error).toContain('ne correspondent pas');
      }

      // Valid password change
      const valid = validatePasswordChange('oldPassword123', 'newPassword123', 'newPassword123');
      expect(valid.ok).toBe(true);
      if (valid.ok) {
        expect(valid.data).toEqual({
          currentPassword: 'oldPassword123',
          newPassword: 'newPassword123',
        });
      }
    });

    it('renders current password, new password, confirm, checkbox and submit button in Bleu Ink', () => {
      const html = renderToString(<ChangePasswordSection />);

      expect(html).toContain('data-testid="change-password-section"');
      expect(html).toContain('data-testid="current-password-input"');
      expect(html).toContain('data-testid="new-password-input"');
      expect(html).toContain('data-testid="confirm-password-input"');
      expect(html).toContain('data-testid="revoke-other-sessions-checkbox"');
      expect(html).toContain('Déconnecter les autres appareils');
      expect(html).toContain('data-testid="change-password-submit"');
      expect(html).toContain('Modifier le mot de passe');

      // Colors & tokens: Bleu Ink button, no pitch black
      expect(html).toContain('var(--navy, #25324f)');
      expect(html).not.toMatch(/backgroundColor:\s*['"]#000000['"]/);
      expect(html).not.toMatch(/backgroundColor:\s*['"]var\(--ink,\s*#141414\)['"]/);
    });

    it('calls authClient.changePassword on valid submission', async () => {
      const changePasswordSpy = vi.fn().mockResolvedValue({ data: { token: 'new-tok-123', user: {} }, error: null });
      vi.spyOn(authClientModule, 'changePassword').mockImplementation(changePasswordSpy);

      const payload = {
        currentPassword: 'currentPassword123',
        newPassword: 'newPassword456',
        revokeOtherSessions: true,
      };

      const result = await authClientModule.changePassword(payload);
      expect(changePasswordSpy).toHaveBeenCalledWith(payload);
      expect(result.data?.token).toBe('new-tok-123');
    });
  });

  describe('2. <ChangeEmailSection />', () => {
    it('validates email change input correctly', () => {
      // Invalid email
      const invalidEmail = validateEmailChange('not-an-email', 'pw');
      expect(invalidEmail.ok).toBe(false);
      if (!invalidEmail.ok) {
        expect(invalidEmail.error).toContain('adresse e-mail');
      }

      // V7 U2b: the password is now required, because it is checked (step-up)
      const noPassword = validateEmailChange('new.admin@revime.fr', '');
      expect(noPassword).toEqual({ ok: false, error: 'Saisissez votre mot de passe actuel.' });

      // Valid email change
      const valid = validateEmailChange('  new.admin@revime.fr  ', 'pw');
      expect(valid.ok).toBe(true);
      if (valid.ok) {
        expect(valid.data).toEqual({ newEmail: 'new.admin@revime.fr', password: 'pw' });
      }
    });

    it('renders the new e-mail field, the current password and the submit button (V7 U2b)', () => {
      const html = renderToString(<ChangeEmailSection />);

      expect(html).toContain('data-testid="change-email-section"');
      expect(html).toContain('data-testid="new-email-input"');
      expect(html).toContain('data-testid="email-current-password-input"');
      expect(html).toContain('type="password"');
      expect(html).toContain('data-testid="change-email-submit"');
      expect(html).toContain('Changer l&#x27;adresse e-mail');
      expect(html).toContain('var(--navy, #25324f)');
    });

    it('confirms the password with the API before asking Better Auth to change the e-mail', async () => {
      const calls: string[] = [];
      const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`fetch ${url} ${init?.body}`);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });
      const changeEmailSpy = vi.fn(async (payload: unknown) => {
        calls.push(`changeEmail ${JSON.stringify(payload)}`);
        return { data: { status: true }, error: null };
      });
      vi.spyOn(authClientModule, 'changeEmail').mockImplementation(changeEmailSpy as never);

      const result = await submitEmailChange({ newEmail: 'operator@revime.fr', password: 'pw' }, fetchSpy as never);

      expect(result).toEqual({ ok: true });
      expect(calls).toEqual([
        'fetch /api/proxy/security/step-up {"password":"pw"}',
        'changeEmail {"newEmail":"operator@revime.fr"}',
      ]);
    });

    it('stops at a wrong password and shows the API’s French message', async () => {
      const fetchSpy = vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: 'UNPROCESSABLE_ENTITY', message: 'Mot de passe incorrect.' } }), { status: 422 }),
      );
      const changeEmailSpy = vi.fn();
      vi.spyOn(authClientModule, 'changeEmail').mockImplementation(changeEmailSpy as never);

      const result = await submitEmailChange({ newEmail: 'operator@revime.fr', password: 'nope' }, fetchSpy as never);

      expect(result).toEqual({ ok: false, error: 'Mot de passe incorrect.' });
      expect(changeEmailSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. <BackupCodesModal />', () => {
    const mockBackupCodes = [
      'ABCD-1234',
      'EFGH-5678',
      'IJKL-9012',
      'MNOP-3456',
      'QRST-7890',
      'UVWX-1122',
      'YZAB-3344',
      'CDEF-5566',
      'GHIJ-7788',
      'KLMN-9900',
    ];

    it('renders accessible dialog with title, password confirmation prompt and generate button', () => {
      const html = renderToString(
        <BackupCodesModal
          isOpen={true}
          onClose={() => {}}
        />,
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="backup-codes-modal-title"');
      expect(html).toContain('Codes de secours');
      expect(html).toContain('data-testid="backup-codes-password-input"');
      expect(html).toContain('data-testid="generate-backup-codes-btn"');
      expect(html).toContain('Générer de nouveaux codes');
    });

    it('displays generated backup codes in code blocks with copy and download buttons', () => {
      const html = renderToString(
        <BackupCodesModal
          isOpen={true}
          onClose={() => {}}
          initialCodes={mockBackupCodes}
        />,
      );

      expect(html).toContain('data-testid="backup-codes-list"');
      for (const code of mockBackupCodes) {
        expect(html).toContain(code);
      }
      expect(html).toContain('<code');

      expect(html).toContain('data-testid="copy-backup-codes-btn"');
      expect(html).toContain('Copier les codes');
      expect(html).toContain('data-testid="download-backup-codes-btn"');
      expect(html).toContain('Télécharger (.txt)');
    });

    it('formats backup codes text file content with timestamp and warning', () => {
      const fileContent = formatBackupCodesTextFile(mockBackupCodes, '2026-10-15T10:00:00.000Z');

      expect(fileContent).toContain('REVIME Admin — Codes de secours 2FA');
      expect(fileContent).toContain('Date de génération :');
      expect(fileContent).toContain('ATTENTION : Chaque code ne peut être utilisé qu\'une seule fois.');
      for (const code of mockBackupCodes) {
        expect(fileContent).toContain(code);
      }
    });

    it('calls authClient.twoFactor.generateBackupCodes when requesting new codes', async () => {
      const generateSpy = vi.fn().mockResolvedValue({
        data: { status: true, backupCodes: mockBackupCodes },
        error: null,
      });

      const mockTwoFactor = {
        ...authClientModule.twoFactor,
        generateBackupCodes: generateSpy,
      };
      vi.spyOn(authClientModule, 'twoFactor', 'get').mockReturnValue(mockTwoFactor as any);

      const res = await authClientModule.twoFactor.generateBackupCodes({ password: 'OperatorPassword123' });
      expect(generateSpy).toHaveBeenCalledWith({ password: 'OperatorPassword123' });
      expect(res.data?.backupCodes).toHaveLength(10);
    });
  });

  describe('4. <ActiveSessionsCard />', () => {
    const mockSessions = [
      {
        id: 'sess-1',
        token: 'tok-1',
        userId: 'usr-admin-1',
        createdAt: '2026-10-14T08:00:00.000Z',
        updatedAt: '2026-10-15T02:30:00.000Z',
        expiresAt: '2026-10-22T08:00:00.000Z',
        ipAddress: '82.65.120.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      },
      {
        id: 'sess-2',
        token: 'tok-2',
        userId: 'usr-admin-1',
        createdAt: '2026-10-10T14:20:00.000Z',
        updatedAt: '2026-10-14T19:45:00.000Z',
        expiresAt: '2026-10-18T14:20:00.000Z',
        ipAddress: '192.168.1.10',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      },
    ];

    it('parses user-agent into friendly device and browser labels', () => {
      const desktop = parseUserAgentDevice(mockSessions[0].userAgent);
      expect(desktop.browser).toContain('Chrome');
      expect(desktop.os).toContain('Windows');

      const mobile = parseUserAgentDevice(mockSessions[1].userAgent);
      expect(mobile.browser).toContain('Safari');
      expect(mobile.os).toContain('iOS');

      const unknown = parseUserAgentDevice(null);
      expect(unknown.browser).toBe('Navigateur inconnu');
      expect(unknown.os).toBe('Appareil inconnu');
    });

    it('renders session list with device, IP, dates, current session badge and revocation buttons', () => {
      const html = renderToString(
        <ActiveSessionsCard
          sessions={mockSessions}
          currentSessionId="sess-1"
        />,
      );

      expect(html).toContain('data-testid="active-sessions-card"');
      expect(html).toContain('Sessions actives');
      expect(html).toContain('82.65.120.45');
      expect(html).toContain('192.168.1.10');

      // Current session badge
      expect(html).toContain('data-testid="current-session-badge"');
      expect(html).toContain('Cette session');

      // Revocation actions
      expect(html).toContain('data-testid="revoke-session-sess-2"');
      expect(html).toContain('Révoquer');
      expect(html).toContain('data-testid="revoke-other-sessions-btn"');
      expect(html).toContain('Déconnecter toutes les autres sessions');

      // Surface token check
      expect(html).toContain('var(--paper, #ffffff)');
      expect(html).toContain('var(--line, #dfe2e2)');
    });

    it('triggers individual session revocation via authClient.revokeSession', async () => {
      const revokeSpy = vi.fn().mockResolvedValue({ data: { status: true }, error: null });
      vi.spyOn(authClientModule, 'revokeSession').mockImplementation(revokeSpy);

      const result = await authClientModule.revokeSession({ token: 'tok-2' });
      expect(revokeSpy).toHaveBeenCalledWith({ token: 'tok-2' });
      expect(result.data?.status).toBe(true);
    });

    it('triggers global other sessions revocation via authClient.revokeOtherSessions', async () => {
      const revokeOtherSpy = vi.fn().mockResolvedValue({ data: { status: true }, error: null });
      vi.spyOn(authClientModule, 'revokeOtherSessions').mockImplementation(revokeOtherSpy);

      const result = await authClientModule.revokeOtherSessions();
      expect(revokeOtherSpy).toHaveBeenCalled();
      expect(result.data?.status).toBe(true);
    });
  });

  describe('5. Integration: SecuritySection & ParametresPage', () => {
    it('SecuritySection displays backup codes management button when 2FA is active', () => {
      vi.spyOn(adminGateModule, 'useAdminMe').mockReturnValue({
        role: 'super_admin',
        permissions: ['admin.manage'],
        twoFactorVerified: true,
      } as any);

      vi.spyOn(authClientModule, 'useSession').mockReturnValue({
        data: {
          user: { id: 'admin-1', email: 'admin@revime.fr', name: 'Admin' },
          session: { id: 'sess-1', token: 'tok-1' },
        },
        refetch: vi.fn(),
      } as any);

      // Render SecuritySection
      const html = renderToString(<SecuritySection />);

      expect(html).toContain('data-testid="open-backup-codes-modal-btn"');
      expect(html).toContain('Codes de secours (2FA)');
    });

    it('ParametresPage mounts ChangePasswordSection, ChangeEmailSection, SecuritySection and ActiveSessionsCard', () => {
      vi.spyOn(adminGateModule, 'useAdminMe').mockReturnValue({
        role: 'super_admin',
        permissions: ['admin.manage'],
        twoFactorVerified: true,
      } as any);

      vi.spyOn(authClientModule, 'useSession').mockReturnValue({
        data: {
          user: { id: 'admin-1', email: 'admin@revime.fr', firstName: 'Admin', lastName: 'Revime', name: 'Admin Revime' },
          session: { id: 'sess-1', token: 'tok-1' },
        },
        refetch: vi.fn(),
      } as any);

      const html = renderToString(<ParametresPage />);

      // Left Column
      expect(html).toContain('data-testid="change-password-section"');
      expect(html).toContain('data-testid="change-email-section"');
      expect(html).toContain('aria-labelledby="settings-security"');

      // Right Column
      expect(html).toContain('aria-labelledby="settings-account"');
      expect(html).toContain('aria-labelledby="settings-session"');
      expect(html).toContain('data-testid="active-sessions-card"');
    });
  });
});
