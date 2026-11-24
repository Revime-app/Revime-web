import { describe, expect, it } from 'vitest';
import {
  inviteStaffInputSchema,
  acceptStaffInvitationInputSchema,
  adminStaffListQuerySchema,
  adminStaffListResponseSchema,
} from '../src/staff-invitation.schemas.js';
import {
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_ACTION_LABEL,
} from '../src/admin.schemas.js';

describe('Staff Invitation Schemas & Audit Actions (CF5-09)', () => {
  describe('inviteStaffInputSchema', () => {
    it('accepts valid input with all fields and normalizes email', () => {
      const parsed = inviteStaffInputSchema.parse({
        email: '  Staff.Member@Example.COM  ',
        role: 'moderation',
        firstName: '  Alice  ',
        lastName: '  Dupont  ',
      });

      expect(parsed).toEqual({
        email: 'staff.member@example.com',
        role: 'moderation',
        firstName: 'Alice',
        lastName: 'Dupont',
      });
    });

    it('accepts valid input with only email and role', () => {
      const parsed = inviteStaffInputSchema.parse({
        email: 'admin@repareme.fr',
        role: 'admin',
      });

      expect(parsed).toEqual({
        email: 'admin@repareme.fr',
        role: 'admin',
      });
    });

    it('rejects invalid email with specific error message', () => {
      const res = inviteStaffInputSchema.safeParse({
        email: 'not-an-email',
        role: 'support',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Adresse e-mail invalide.');
      }
    });

    it('rejects invalid role', () => {
      const res = inviteStaffInputSchema.safeParse({
        email: 'user@repareme.fr',
        role: 'super_hero',
      });

      expect(res.success).toBe(false);
    });

    it('rejects empty string firstName when provided', () => {
      const res = inviteStaffInputSchema.safeParse({
        email: 'user@repareme.fr',
        role: 'read_only',
        firstName: '',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Le prénom est requis.');
      }
    });

    it('rejects overly long firstName and lastName (> 100 chars)', () => {
      const longStr = 'a'.repeat(101);
      const resFirst = inviteStaffInputSchema.safeParse({
        email: 'user@repareme.fr',
        role: 'support',
        firstName: longStr,
      });
      expect(resFirst.success).toBe(false);

      const resLast = inviteStaffInputSchema.safeParse({
        email: 'user@repareme.fr',
        role: 'support',
        lastName: longStr,
      });
      expect(resLast.success).toBe(false);
    });
  });

  describe('acceptStaffInvitationInputSchema', () => {
    it('accepts valid input with all fields', () => {
      const token = 'a'.repeat(32);
      const parsed = acceptStaffInvitationInputSchema.parse({
        token,
        password: 'securePassword123!',
        firstName: '  Bob  ',
        lastName: '  Martin  ',
      });

      expect(parsed).toEqual({
        token,
        password: 'securePassword123!',
        firstName: 'Bob',
        lastName: 'Martin',
      });
    });

    it('accepts valid input with only token and password', () => {
      const token = 'b'.repeat(64);
      const parsed = acceptStaffInvitationInputSchema.parse({
        token,
        password: 'mySuperSecretPassword',
      });

      expect(parsed).toEqual({
        token,
        password: 'mySuperSecretPassword',
      });
    });

    it('rejects token shorter than 32 characters', () => {
      const res = acceptStaffInvitationInputSchema.safeParse({
        token: 'short-token',
        password: 'validPassword123',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe("Jeton d'invitation invalide.");
      }
    });

    it('rejects password shorter than 8 characters', () => {
      const res = acceptStaffInvitationInputSchema.safeParse({
        token: 'c'.repeat(32),
        password: 'short',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Le mot de passe doit contenir au moins 8 caractères.');
      }
    });

    it('rejects password longer than 128 characters', () => {
      const res = acceptStaffInvitationInputSchema.safeParse({
        token: 'c'.repeat(32),
        password: 'p'.repeat(129),
      });

      expect(res.success).toBe(false);
    });

    it('rejects empty string firstName when provided', () => {
      const res = acceptStaffInvitationInputSchema.safeParse({
        token: 'c'.repeat(32),
        password: 'validPassword123',
        firstName: '   ',
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toBe('Le prénom est requis.');
      }
    });
  });

  describe('adminStaffListQuerySchema', () => {
    it('applies default pagination values', () => {
      const parsed = adminStaffListQuerySchema.parse({});
      expect(parsed).toEqual({ page: 1, pageSize: 20 });
    });

    it('coerces strings and accepts search query q', () => {
      const parsed = adminStaffListQuerySchema.parse({
        q: '  Alice  ',
        page: '2',
        pageSize: '50',
      });
      expect(parsed).toEqual({
        q: 'Alice',
        page: 2,
        pageSize: 50,
      });
    });

    it('rejects pageSize greater than 100', () => {
      const res = adminStaffListQuerySchema.safeParse({ pageSize: 101 });
      expect(res.success).toBe(false);
    });
  });

  describe('adminStaffListResponseSchema', () => {
    it('validates a correct paginated response structure', () => {
      const sampleItem = {
        id: 'usr-1',
        email: 'alice@revime.fr',
        name: 'Alice Admin',
        firstName: 'Alice',
        lastName: 'Admin',
        role: 'super_admin' as const,
        twoFactorEnabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: '2026-10-14T09:00:00.000Z',
      };
      const res = adminStaffListResponseSchema.safeParse({
        items: [sampleItem],
        total: 1,
        page: 1,
        pageSize: 20,
      });
      expect(res.success).toBe(true);
    });
  });

  describe('Admin Audit Actions for Staff Invitations & Management', () => {
    const requiredStaffAuditActions = [
      'admin.staff_invite',
      'admin.staff_invite_revoke',
      'admin.staff_invite_resend',
      'admin.staff_invite_accept',
      'admin.staff_remove',
    ] as const;

    it('includes all staff invitation actions in adminAuditActionSchema', () => {
      for (const action of requiredStaffAuditActions) {
        expect(adminAuditActionSchema.safeParse(action).success).toBe(true);
      }
    });

    it('includes all staff invitation actions in ADMIN_AUDIT_ACTIONS array', () => {
      for (const action of requiredStaffAuditActions) {
        expect(ADMIN_AUDIT_ACTIONS).toContain(action);
      }
    });

    it('has user-friendly labels in ADMIN_AUDIT_ACTION_LABEL for all staff actions', () => {
      for (const action of requiredStaffAuditActions) {
        const label = ADMIN_AUDIT_ACTION_LABEL[action];
        expect(label).toBeDefined();
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }
    });
  });
});

