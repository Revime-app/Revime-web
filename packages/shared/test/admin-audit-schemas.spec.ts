import { describe, it, expect } from 'vitest';
import {
  adminAuditDomainSchema,
  ADMIN_AUDIT_DOMAINS,
  getDomainForAction,
  getActionLabel,
  adminAuditListQuerySchema,
  adminAuditDetailedEntrySchema,
  adminAuditListResponseSchema,
  adminAuditKpisSchema,
} from '../src/admin-audit.schemas.js';

describe('Admin Audit Schemas (@revime/shared)', () => {
  describe('ADMIN_AUDIT_DOMAINS and helpers', () => {
    it('groups all actions into the 6 expected domains', () => {
      const domains = Object.keys(ADMIN_AUDIT_DOMAINS);
      expect(domains).toContain('COMMANDES');
      expect(domains).toContain('USERS');
      expect(domains).toContain('LITIGES_SIGNALEMENTS');
      expect(domains).toContain('CATALOGUE_CONTENU');
      expect(domains).toContain('MARKETING_PROMOS');
      expect(domains).toContain('SECURITE_AUTH');

      expect(ADMIN_AUDIT_DOMAINS.COMMANDES.actions).toContain('commande.refund');
      expect(ADMIN_AUDIT_DOMAINS.USERS.actions).toContain('user.suspend');
      expect(ADMIN_AUDIT_DOMAINS.LITIGES_SIGNALEMENTS.actions).toContain('dispute.open');
      expect(ADMIN_AUDIT_DOMAINS.CATALOGUE_CONTENU.actions).toContain('category.create');
      expect(ADMIN_AUDIT_DOMAINS.MARKETING_PROMOS.actions).toContain('promo.create');
      expect(ADMIN_AUDIT_DOMAINS.SECURITE_AUTH.actions).toContain('auth.admin.impersonate');
    });

    it('has labels for each domain', () => {
      expect(ADMIN_AUDIT_DOMAINS.COMMANDES.label).toBe('Commandes & Remboursements');
      expect(ADMIN_AUDIT_DOMAINS.USERS.label).toBe('Utilisateurs & Réparateurs');
      expect(ADMIN_AUDIT_DOMAINS.LITIGES_SIGNALEMENTS.label).toBe('Litiges & Signalements');
      expect(ADMIN_AUDIT_DOMAINS.CATALOGUE_CONTENU.label).toBe('Catalogue & Contenu');
      expect(ADMIN_AUDIT_DOMAINS.MARKETING_PROMOS.label).toBe('Marketing & Promos');
      expect(ADMIN_AUDIT_DOMAINS.SECURITE_AUTH.label).toBe('Sécurité & Accès');
    });

    it('correctly maps actions to their domain with getDomainForAction', () => {
      expect(getDomainForAction('commande.refund')).toBe('COMMANDES');
      expect(getDomainForAction('user.suspend')).toBe('USERS');
      expect(getDomainForAction('dispute.open')).toBe('LITIGES_SIGNALEMENTS');
      expect(getDomainForAction('category.create')).toBe('CATALOGUE_CONTENU');
      expect(getDomainForAction('promo.create')).toBe('MARKETING_PROMOS');
      expect(getDomainForAction('auth.admin.impersonate')).toBe('SECURITE_AUTH');
    });

    it('defaults to SECURITE_AUTH for unknown action in getDomainForAction', () => {
      expect(getDomainForAction('completely.unknown.action')).toBe('SECURITE_AUTH');
    });

    it('resolves French human labels with getActionLabel', () => {
      expect(getActionLabel('user.suspend')).toBe('Suspension');
      expect(getActionLabel('commande.refund')).toBe('Remboursement');
      expect(getActionLabel('dispute.open')).toBe("Ouverture d'un litige");
    });

    it('falls back to raw action string in getActionLabel for unmapped action', () => {
      expect(getActionLabel('custom.unmapped.action')).toBe('custom.unmapped.action');
    });
  });

  describe('adminAuditDomainSchema', () => {
    it('accepts the 6 valid domains', () => {
      const valid = ['COMMANDES', 'USERS', 'LITIGES_SIGNALEMENTS', 'CATALOGUE_CONTENU', 'MARKETING_PROMOS', 'SECURITE_AUTH'];
      for (const d of valid) {
        expect(adminAuditDomainSchema.safeParse(d).success).toBe(true);
      }
    });

    it('rejects unknown domain', () => {
      expect(adminAuditDomainSchema.safeParse('UNKNOWN_DOMAIN').success).toBe(false);
    });
  });

  describe('adminAuditListQuerySchema', () => {
    it('parses valid query filters with defaults', () => {
      const parsed = adminAuditListQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(25);
    });

    it('parses multi-criteria filters with coercion', () => {
      const parsed = adminAuditListQuerySchema.parse({
        q: '  admin@revime.fr  ',
        actorEmail: '  admin@revime.fr  ',
        domain: 'COMMANDES',
        action: 'commande.refund',
        targetType: '  Commande  ',
        targetId: '  cmd-123  ',
        statusCode: '200',
        statusFamily: '2xx',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-16T23:59:59.000Z',
        page: '2',
        limit: '50',
      });
      expect(parsed.q).toBe('admin@revime.fr');
      expect(parsed.actorEmail).toBe('admin@revime.fr');
      expect(parsed.domain).toBe('COMMANDES');
      expect(parsed.action).toBe('commande.refund');
      expect(parsed.targetType).toBe('Commande');
      expect(parsed.targetId).toBe('cmd-123');
      expect(parsed.statusCode).toBe(200);
      expect(parsed.statusFamily).toBe('2xx');
      expect(parsed.startDate).toBe('2026-10-01T00:00:00.000Z');
      expect(parsed.endDate).toBe('2026-10-16T23:59:59.000Z');
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
    });

    it('rejects limit greater than 100', () => {
      const res = adminAuditListQuerySchema.safeParse({ limit: 101 });
      expect(res.success).toBe(false);
    });

    it('rejects invalid statusFamily', () => {
      const res = adminAuditListQuerySchema.safeParse({ statusFamily: '3xx' });
      expect(res.success).toBe(false);
    });

    it('rejects invalid datetime for startDate / endDate', () => {
      expect(adminAuditListQuerySchema.safeParse({ startDate: 'not-a-date' }).success).toBe(false);
      expect(adminAuditListQuerySchema.safeParse({ endDate: 'not-a-date' }).success).toBe(false);
    });
  });

  describe('adminAuditDetailedEntrySchema & adminAuditListResponseSchema', () => {
    it('validates a complete audit entry with details', () => {
      const entry = {
        id: 'clx123',
        actorUserId: 'usr-1',
        actorEmail: 'admin@revime.fr',
        actorRole: 'SUPER_ADMIN',
        action: 'user.suspend',
        actionLabel: "Suspension d'utilisateur",
        domain: 'USERS',
        targetType: 'User',
        targetId: 'usr-target',
        statusCode: 200,
        detail: { reason: 'Violation CGU' },
        createdAt: '2026-10-16T10:00:00.000Z',
      };
      const parsed = adminAuditDetailedEntrySchema.parse(entry);
      expect(parsed.id).toBe('clx123');
      expect(parsed.actionLabel).toBe("Suspension d'utilisateur");
      expect(parsed.statusCode).toBe(200);
      expect(parsed.detail).toEqual({ reason: 'Violation CGU' });
    });

    it('accepts null for nullable fields in entry', () => {
      const entry = {
        id: 'clx456',
        actorUserId: null,
        actorEmail: 'system@revime.fr',
        actorRole: null,
        action: 'commande.refund',
        actionLabel: 'Remboursement',
        domain: 'COMMANDES',
        targetType: null,
        targetId: null,
        statusCode: 200,
        detail: null,
        createdAt: '2026-10-16T10:00:00.000Z',
      };
      const parsed = adminAuditDetailedEntrySchema.parse(entry);
      expect(parsed.actorUserId).toBeNull();
      expect(parsed.actorRole).toBeNull();
      expect(parsed.targetType).toBeNull();
      expect(parsed.targetId).toBeNull();
      expect(parsed.detail).toBeNull();
    });

    it('validates a paginated list response', () => {
      const entry = {
        id: 'clx123',
        actorUserId: 'usr-1',
        actorEmail: 'admin@revime.fr',
        actorRole: 'SUPER_ADMIN',
        action: 'user.suspend',
        actionLabel: "Suspension d'utilisateur",
        domain: 'USERS',
        targetType: 'User',
        targetId: 'usr-target',
        statusCode: 200,
        detail: { reason: 'Violation CGU' },
        createdAt: '2026-10-16T10:00:00.000Z',
      };
      const response = {
        items: [entry],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      };
      expect(adminAuditListResponseSchema.parse(response)).toEqual(response);
    });

    it('rejects negative total or totalPages in list response', () => {
      expect(adminAuditListResponseSchema.safeParse({
        items: [],
        total: -1,
        page: 1,
        pageSize: 25,
        totalPages: 0,
      }).success).toBe(false);

      expect(adminAuditListResponseSchema.safeParse({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: -1,
      }).success).toBe(false);
    });
  });

  describe('adminAuditKpisSchema', () => {
    it('validates audit summary KPIs', () => {
      const kpis = {
        actionsTodayCount: 42,
        uniqueActorsTodayCount: 4,
        topDomain: 'Commandes & Remboursements',
        totalActionsCount: 1530,
      };
      expect(adminAuditKpisSchema.parse(kpis)).toEqual(kpis);
    });

    it('rejects negative counts in KPIs', () => {
      expect(adminAuditKpisSchema.safeParse({
        actionsTodayCount: -1,
        uniqueActorsTodayCount: 4,
        topDomain: 'Commandes & Remboursements',
        totalActionsCount: 1530,
      }).success).toBe(false);
    });
  });
});
