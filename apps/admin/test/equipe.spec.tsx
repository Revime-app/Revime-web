import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { LINKS } from '../components/AdminNav';
import { ADMIN_ROLES, ADMIN_ROLE_LABEL, type AdminRole, type StaffMemberItem, type StaffInvitationItem } from '@revime/shared';
import { hasPermission } from '../lib/permissions';
import {
  InviteStaffModal,
  ADMIN_ROLE_DESCRIPTIONS,
  validateInviteInput,
  sendInviteRequest,
} from '../app/equipe/InviteStaffModal';
import {
  EditRoleModal,
  sendEditRoleRequest,
} from '../app/equipe/EditRoleModal';
import {
  EquipePageView,
  StaffMembersTable,
  InvitationsTable,
  sendResendInvitationRequest,
  sendRevokeInvitationRequest,
  sendResetTwoFactorRequest,
  getInvitationStatusBadge,
  getTwoFactorBadge,
} from '../app/equipe/page';

describe('Task 7: Admin Staff & Invitations Management (/equipe)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Navigation & Access Control', () => {
    it('includes /equipe link in AdminNav LINKS right after /utilisateurs', () => {
      const equipeLink = LINKS.find((l) => l.href === '/equipe');
      expect(equipeLink).toEqual({
        href: '/equipe',
        label: 'Équipe',
        badgeKey: 'equipe',
        badgeKind: 'info',
      });

      const utilisateursIdx = LINKS.findIndex((l) => l.href === '/utilisateurs');
      const equipeIdx = LINKS.findIndex((l) => l.href === '/equipe');
      expect(equipeIdx).toBe(utilisateursIdx + 1);
    });

    it('requires admin.manage permission (Super Admin only)', () => {
      expect(hasPermission({ role: 'super_admin', permissions: ['admin.manage'], twoFactorVerified: true }, 'admin.manage')).toBe(true);
      expect(hasPermission({ role: 'admin', permissions: [], twoFactorVerified: true }, 'admin.manage')).toBe(false);
      expect(hasPermission({ role: 'moderation', permissions: [], twoFactorVerified: true }, 'admin.manage')).toBe(false);
      expect(hasPermission({ role: 'support', permissions: [], twoFactorVerified: true }, 'admin.manage')).toBe(false);
      expect(hasPermission({ role: 'finance', permissions: [], twoFactorVerified: true }, 'admin.manage')).toBe(false);
      expect(hasPermission({ role: 'read_only', permissions: [], twoFactorVerified: true }, 'admin.manage')).toBe(false);
      expect(hasPermission(null, 'admin.manage')).toBe(false);
      expect(hasPermission({ role: 'super_admin', permissions: ['admin.manage'], twoFactorVerified: false }, 'admin.manage')).toBe(false);
    });
  });

  describe('2. Role Labels & Helper Descriptions Dictionary', () => {
    it('provides clear French labels and descriptions for all 6 roles', () => {
      for (const role of ADMIN_ROLES) {
        expect(ADMIN_ROLE_LABEL[role]).toBeDefined();
        expect(typeof ADMIN_ROLE_LABEL[role]).toBe('string');
        expect(ADMIN_ROLE_DESCRIPTIONS[role]).toBeDefined();
        expect(ADMIN_ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(10);
      }
    });
  });

  describe('3. Badges Formatting', () => {
    it('formats 2FA status badge correctly', () => {
      const active = getTwoFactorBadge(true);
      expect(active.label).toBe('Activée');
      expect(active.tone).toBe('success');

      const pending = getTwoFactorBadge(false);
      expect(pending.label).toBe('En attente');
      expect(pending.tone).toBe('warning');
    });

    it('formats invitation status badges correctly', () => {
      expect(getInvitationStatusBadge('PENDING').label).toBe('En attente');
      expect(getInvitationStatusBadge('ACCEPTED').label).toBe('Acceptée');
      expect(getInvitationStatusBadge('REVOKED').label).toBe('Révoquée');
      expect(getInvitationStatusBadge('EXPIRED').label).toBe('Expirée');
    });
  });

  describe('4. InviteStaffModal Component & Submissions', () => {
    it('validates email input format', () => {
      expect(validateInviteInput('', 'moderation').ok).toBe(false);
      expect(validateInviteInput('invalid-email', 'moderation').ok).toBe(false);
      expect(validateInviteInput('valid@revime.fr', 'moderation').ok).toBe(true);
      expect(validateInviteInput('valid@revime.fr', 'moderation', 'Jean', 'Dupont').ok).toBe(true);
    });

    it('renders modal with title, role selector, helper text and fields', () => {
      const html = renderToString(
        <InviteStaffModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
        />,
      );

      expect(html).toContain('Inviter un collaborateur');
      expect(html).toContain('E-mail');
      expect(html).toContain('Prénom');
      expect(html).toContain('Nom');
      expect(html).toContain('Rôle');
      for (const role of ADMIN_ROLES) {
        expect(html).toContain(ADMIN_ROLE_LABEL[role]);
      }
      expect(html).toMatch(/Envoyer l[’']invitation/);
    });

    it('sends POST /api/proxy/admin/staff/invitations with trimmed values', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, id: 'inv-123' }),
      });
      global.fetch = mockFetch;

      const result = await sendInviteRequest({
        email: '  Nouveau.Staff@Revime.fr  ',
        role: 'moderation',
        firstName: '  Claire ',
        lastName: ' Moreau ',
      });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/staff/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nouveau.staff@revime.fr',
          role: 'moderation',
          firstName: 'Claire',
          lastName: 'Moreau',
        }),
      });
    });

    it('handles 409 conflict API error (already part of team)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { message: "Cet utilisateur fait déjà partie de l'équipe." } }),
      });

      const result = await sendInviteRequest({
        email: 'existant@revime.fr',
        role: 'support',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Cet utilisateur fait déjà partie de l'équipe.");
      }
    });
  });

  describe('5. EditRoleModal Component & Role Changes', () => {
    const sampleMember: StaffMemberItem = {
      id: 'usr-99',
      email: 'thomas@revime.fr',
      name: 'Thomas Bernard',
      firstName: 'Thomas',
      lastName: 'Bernard',
      role: 'support',
      twoFactorEnabled: true,
      createdAt: '2026-05-10T10:00:00.000Z',
    };

    it('renders modal with member identity, current role, and warning', () => {
      const html = renderToString(
        <EditRoleModal
          member={sampleMember}
          onClose={() => {}}
          onSuccess={() => {}}
        />,
      );

      expect(html).toContain('Modifier le rôle');
      expect(html).toContain('Thomas Bernard');
      expect(html).toContain('thomas@revime.fr');
      expect(html).toContain('La modification du rôle fermera immédiatement toutes les sessions actives');
      expect(html).toContain('Enregistrer');
    });

    it('sends PATCH /api/proxy/admin/users/:id/role', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      const result = await sendEditRoleRequest('usr-99', 'admin');

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/users/usr-99/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      });
    });

    it('handles 409 conflict error when minimum 2 super admins rule is violated', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: { message: 'La plateforme doit conserver au moins 2 Super Admins actifs en permanence.' },
        }),
      });

      const result = await sendEditRoleRequest('usr-last-superadmin', 'admin');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('La plateforme doit conserver au moins 2 Super Admins actifs en permanence.');
      }
    });
  });

  describe('6. Staff & Invitations Tables and Actions', () => {
    const members: StaffMemberItem[] = [
      {
        id: 'usr-1',
        email: 'alice@revime.fr',
        name: 'Alice Dupont',
        firstName: 'Alice',
        lastName: 'Dupont',
        role: 'super_admin',
        twoFactorEnabled: true,
        createdAt: '2026-01-15T09:00:00.000Z',
      },
      {
        id: 'usr-2',
        email: 'bob@revime.fr',
        name: 'Bob Martin',
        firstName: 'Bob',
        lastName: 'Martin',
        role: 'finance',
        twoFactorEnabled: false,
        createdAt: '2026-03-20T14:30:00.000Z',
      },
    ];

    const invitations: StaffInvitationItem[] = [
      {
        id: 'inv-1',
        email: 'claire@revime.fr',
        role: 'moderation',
        firstName: 'Claire',
        lastName: 'Lefevre',
        invitedBy: { id: 'usr-1', name: 'Alice Dupont', email: 'alice@revime.fr' },
        expiresAt: '2026-10-10T23:59:59.000Z',
        acceptedAt: null,
        revokedAt: null,
        status: 'PENDING',
        createdAt: '2026-10-03T10:00:00.000Z',
      },
      {
        id: 'inv-2',
        email: 'david@revime.fr',
        role: 'support',
        firstName: 'David',
        lastName: 'Roux',
        invitedBy: { id: 'usr-1', name: 'Alice Dupont', email: 'alice@revime.fr' },
        expiresAt: '2026-09-01T23:59:59.000Z',
        acceptedAt: null,
        revokedAt: null,
        status: 'EXPIRED',
        createdAt: '2026-08-25T10:00:00.000Z',
      },
    ];

    it('renders StaffMembersTable with names, email, role badges, 2FA badges and actions', () => {
      const html = renderToString(
        <StaffMembersTable
          members={members}
          onEditRole={() => {}}
          onReset2FA={() => {}}
          actionPendingId={null}
        />,
      );

      expect(html).toContain('Alice Dupont');
      expect(html).toContain('alice@revime.fr');
      expect(html).toContain(ADMIN_ROLE_LABEL['super_admin']);
      expect(html).toContain('Activée');

      expect(html).toContain('Bob Martin');
      expect(html).toContain('bob@revime.fr');
      expect(html).toContain('Finance');
      expect(html).toContain('En attente');

      expect(html).toContain('Modifier le rôle');
      expect(html).toContain('Réinitialiser 2FA');
    });

    it('renders InvitationsTable with emails, roles, invitedBy, statuses and pending actions', () => {
      const html = renderToString(
        <InvitationsTable
          invitations={invitations}
          onResend={() => {}}
          onRevoke={() => {}}
          actionPendingId={null}
        />,
      );

      expect(html).toContain('claire@revime.fr');
      expect(html).toContain('Modération');
      expect(html).toContain('Alice Dupont');
      expect(html).toContain('En attente');
      expect(html).toMatch(/Renvoyer l[’']e-mail/);
      expect(html).toContain('Révoquer');

      expect(html).toContain('david@revime.fr');
      expect(html).toContain('Support');
      expect(html).toContain('Expirée');
    });

    it('dispatches invitation resend POST /api/proxy/admin/staff/invitations/:id/resend', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      const result = await sendResendInvitationRequest('inv-1');
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/staff/invitations/inv-1/resend', {
        method: 'POST',
      });
    });

    it('dispatches invitation revocation DELETE /api/proxy/admin/staff/invitations/:id', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      const result = await sendRevokeInvitationRequest('inv-1');
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/staff/invitations/inv-1', {
        method: 'DELETE',
      });
    });

    it('dispatches 2FA reset POST /api/proxy/admin/users/:id/two-factor/reset', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      const result = await sendResetTwoFactorRequest('usr-2');
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/users/usr-2/two-factor/reset', {
        method: 'POST',
      });
    });

    it('renders full EquipePageView with headers and primary action button', () => {
      const html = renderToString(
        <EquipePageView
          members={members}
          invitations={invitations}
          loading={false}
          error={null}
          feedback="Action effectuée avec succès."
          onOpenInviteModal={() => {}}
          onEditRole={() => {}}
          onReset2FA={() => {}}
          onResendInvitation={() => {}}
          onRevokeInvitation={() => {}}
          actionPendingId={null}
        />,
      );

      expect(html).toContain('Équipe');
      expect(html).toContain('Gestion des collaborateurs, attributions de rôles et invitations');
      expect(html).toContain('+ Inviter un collaborateur');
      expect(html).toContain('Action effectuée avec succès.');
      expect(html).toContain('Collaborateurs actifs');
      expect(html).toContain('Invitations');
    });
  });
});
