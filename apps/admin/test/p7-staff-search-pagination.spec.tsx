import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ADMIN_ROLES, ADMIN_ROLE_LABEL, type StaffMemberItem, type StaffInvitationItem } from '@revime/shared';
import {
  StaffMembersTable,
  EquipePageView,
  formatLastLogin,
  sendRemoveMemberRequest,
} from '../app/equipe/page';
import { StaffPermissionsMatrix } from '../components/StaffPermissionsMatrix';

describe('P7 Staff Management — Search, Pagination, Removal & Permissions Matrix', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. formatLastLogin helper', () => {
    it('formats ISO timestamps into French readable dates', () => {
      const formatted = formatLastLogin('2026-10-12T14:30:00.000Z');
      expect(formatted).not.toBe('—');
      expect(formatted).toContain('2026');
      expect(formatted).toMatch(/12/);
    });

    it('returns an em dash — for null or undefined values', () => {
      expect(formatLastLogin(null)).toBe('—');
      expect(formatLastLogin(undefined)).toBe('—');
      expect(formatLastLogin('')).toBe('—');
      expect(formatLastLogin('invalid-date')).toBe('—');
    });
  });

  describe('2. StaffMembersTable columns & removal button', () => {
    const sampleMembers: StaffMemberItem[] = [
      {
        id: 'usr-1',
        email: 'alice@revime.fr',
        name: 'Alice Dupont',
        firstName: 'Alice',
        lastName: 'Dupont',
        role: 'super_admin',
        twoFactorEnabled: true,
        createdAt: '2026-01-01T10:00:00.000Z',
        lastLoginAt: '2026-10-14T08:45:00.000Z',
      },
      {
        id: 'usr-2',
        email: 'bob@revime.fr',
        name: 'Bob Martin',
        firstName: 'Bob',
        lastName: 'Martin',
        role: 'support',
        twoFactorEnabled: false,
        createdAt: '2026-02-01T10:00:00.000Z',
        lastLoginAt: null,
      },
    ];

    it('renders the "Dernière connexion" column and "Retirer de l’équipe" button', () => {
      const html = renderToString(
        <StaffMembersTable
          members={sampleMembers}
          onEditRole={() => {}}
          onReset2FA={() => {}}
          onRemoveMember={() => {}}
          actionPendingId={null}
        />,
      );

      // Check header
      expect(html).toContain('Dernière connexion');
      // Check last login dates
      expect(html).toContain('data-testid="last-login-usr-1"');
      expect(html).toContain('data-testid="last-login-usr-2"');
      expect(html).toContain('—'); // usr-2 has no session
      // Check removal action button
      expect(html).toContain('Retirer de l’équipe');
      expect(html).toContain('data-testid="remove-member-usr-1"');
      expect(html).toContain('data-testid="remove-member-usr-2"');
    });
  });

  describe('3. sendRemoveMemberRequest API client', () => {
    it('dispatches DELETE /api/proxy/admin/staff/members/:id and returns ok: true on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      const result = await sendRemoveMemberRequest('usr-target-123');

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/staff/members/usr-target-123', {
        method: 'DELETE',
      });
    });

    it('returns error message on self-removal rejection (422)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: { message: "Vous ne pouvez pas vous retirer vous-même de l'équipe." },
        }),
      });

      const result = await sendRemoveMemberRequest('usr-self');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Vous ne pouvez pas vous retirer vous-même de l'équipe.");
      }
    });

    it('returns error message on last super admin violation (409)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: { message: 'La plateforme doit conserver au moins 2 Super Admins actifs en permanence.' },
        }),
      });

      const result = await sendRemoveMemberRequest('usr-sa-last');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('La plateforme doit conserver au moins 2 Super Admins actifs en permanence.');
      }
    });
  });

  describe('4. EquipePageView with Search, Pagination & Matrix', () => {
    const sampleMembers: StaffMemberItem[] = [
      {
        id: 'usr-1',
        email: 'alice@revime.fr',
        name: 'Alice Dupont',
        firstName: 'Alice',
        lastName: 'Dupont',
        role: 'super_admin',
        twoFactorEnabled: true,
        createdAt: '2026-01-01T10:00:00.000Z',
        lastLoginAt: '2026-10-14T08:45:00.000Z',
      },
    ];

    const sampleInvitations: StaffInvitationItem[] = [];

    it('renders search input and pagination controls for 52 collaborators', () => {
      const html = renderToString(
        <EquipePageView
          members={sampleMembers}
          invitations={sampleInvitations}
          loading={false}
          error={null}
          feedback={null}
          onOpenInviteModal={() => {}}
          onEditRole={() => {}}
          onReset2FA={() => {}}
          onResendInvitation={() => {}}
          onRevokeInvitation={() => {}}
          actionPendingId={null}
          searchQuery="alice"
          onSearchChange={() => {}}
          onSearchSubmit={() => {}}
          page={1}
          pageSize={20}
          totalMembers={52}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          onRemoveMember={() => {}}
        />,
      );

      // Search input
      expect(html).toContain('data-testid="staff-search-input"');
      expect(html).toContain('value="alice"');
      expect(html).toContain('Rechercher');

      // Total count
      expect(html).toContain('Collaborateurs actifs (52)');

      // Pagination controls
      expect(html).toContain('data-testid="list-pagination"');
      expect(html).toContain('data-testid="pagination-info"');
      expect(html).toMatch(/Page (<!-- -->)?1(<!-- -->)? sur (<!-- -->)?3/);
      expect(html).toContain('Précédent');
      expect(html).toContain('Suivant');

      // Permissions matrix mounted at bottom
      expect(html).toContain('data-testid="staff-permissions-matrix"');
      expect(html).toContain('Matrice des droits par rôle');
    });
  });

  describe('5. StaffPermissionsMatrix Component', () => {
    it('renders collapsible permissions matrix with toggle button', () => {
      const htmlCollapsed = renderToString(<StaffPermissionsMatrix defaultExpanded={false} />);
      expect(htmlCollapsed).toContain('Matrice des droits par rôle');
      expect(htmlCollapsed).toContain('data-testid="toggle-permissions-matrix"');
      expect(htmlCollapsed).toContain('Consulter la matrice');

      const htmlExpanded = renderToString(<StaffPermissionsMatrix defaultExpanded={true} />);
      expect(htmlExpanded).toContain('Masquer la matrice');
      // All 6 role columns
      for (const role of ADMIN_ROLES) {
        expect(htmlExpanded).toContain(ADMIN_ROLE_LABEL[role]);
      }
      // Permissions
      expect(htmlExpanded).toContain('Administration &amp; Équipe');
      expect(htmlExpanded).toContain('Lecture du tableau de bord');
      expect(htmlExpanded).toContain('Audit de conformité');
      // Checkmark symbol
      expect(htmlExpanded).toContain('✓');
    });
  });
});
