import { describe, expect, it } from 'vitest';
import {
  adminAlertTypeSchema,
  adminAlertSeveritySchema,
  adminAlertTargetTypeSchema,
  ADMIN_ALERT_TYPE_LABELS,
  adminAlertListQuerySchema,
  adminAlertItemSchema,
  adminAlertListResponseSchema,
  adminAlertKpisSchema,
  adminAlertPreferencesSchema,
  adminAlertPreferencesPatchSchema,
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
} from '../src/index.js';

describe('Admin Alert Schemas Contract', () => {
  it('validates all 4 alert types in adminAlertTypeSchema', () => {
    const types = ['DISPUTE_NEW', 'REPORT_SEVERE', 'PAYMENT_FAILED', 'PARCEL_INCIDENT'];
    for (const t of types) {
      expect(adminAlertTypeSchema.safeParse(t).success).toBe(true);
      expect(ADMIN_ALERT_TYPE_LABELS[t as keyof typeof ADMIN_ALERT_TYPE_LABELS]).toBeDefined();
    }
    expect(adminAlertTypeSchema.safeParse('UNKNOWN').success).toBe(false);
  });

  it('validates severities in adminAlertSeveritySchema', () => {
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM'];
    for (const s of severities) {
      expect(adminAlertSeveritySchema.safeParse(s).success).toBe(true);
    }
    expect(adminAlertSeveritySchema.safeParse('LOW').success).toBe(false);
  });

  it('validates target types in adminAlertTargetTypeSchema', () => {
    const targets = ['Dispute', 'ConversationReport', 'Commande', 'Shipment'];
    for (const target of targets) {
      expect(adminAlertTargetTypeSchema.safeParse(target).success).toBe(true);
    }
    expect(adminAlertTargetTypeSchema.safeParse('Other').success).toBe(false);
  });

  it('parses adminAlertListQuerySchema with defaults', () => {
    const parsed = adminAlertListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.isRead).toBe('all');
  });

  it('parses adminAlertListQuerySchema with custom params and coercion', () => {
    const parsed = adminAlertListQuerySchema.parse({
      page: '3',
      limit: '50',
      type: 'PAYMENT_FAILED',
      severity: 'HIGH',
      isRead: 'false',
      q: '  échec Stripe  ',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
    expect(parsed.type).toBe('PAYMENT_FAILED');
    expect(parsed.severity).toBe('HIGH');
    expect(parsed.isRead).toBe('false');
    expect(parsed.q).toBe('échec Stripe');
  });

  it('rejects invalid limit or page in adminAlertListQuerySchema', () => {
    expect(adminAlertListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(adminAlertListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(adminAlertListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('validates adminAlertItemSchema and adminAlertListResponseSchema', () => {
    const item = {
      id: 'a0000000-0000-4000-8000-000000000001',
      type: 'DISPUTE_NEW',
      severity: 'CRITICAL',
      title: 'Nouveau litige #LIT-0042',
      message: 'Un litige a été ouvert pour la commande #CMD-1234',
      targetType: 'Dispute',
      targetId: 'd0000000-0000-0000-0000-000000000001',
      link: '/litiges/d0000000-0000-0000-0000-000000000001',
      isRead: false,
      readAt: null,
      readByUserId: null,
      emailSent: true,
      emailSentAt: new Date().toISOString(),
      metadata: { amountCents: 8500 },
      createdAt: new Date().toISOString(),
    };
    expect(adminAlertItemSchema.safeParse(item).success).toBe(true);

    const listResponse = {
      items: [item],
      total: 1,
      unreadCount: 1,
      page: 1,
      limit: 20,
    };
    expect(adminAlertListResponseSchema.safeParse(listResponse).success).toBe(true);
  });

  it('validates adminAlertKpisSchema', () => {
    const kpis = {
      unreadTotal: 5,
      criticalCount: 2,
      disputesCount: 3,
      paymentsCount: 1,
    };
    expect(adminAlertKpisSchema.safeParse(kpis).success).toBe(true);
    expect(adminAlertKpisSchema.safeParse({ ...kpis, unreadTotal: -1 }).success).toBe(false);
  });

  it('validates adminAlertPreferencesSchema with all true defaults', () => {
    const prefs = adminAlertPreferencesSchema.parse({});
    expect(prefs.emailDisputes).toBe(true);
    expect(prefs.emailReports).toBe(true);
    expect(prefs.emailPayments).toBe(true);
    expect(prefs.emailParcels).toBe(true);
    expect(prefs.bellDisputes).toBe(true);
    expect(prefs.bellReports).toBe(true);
    expect(prefs.bellPayments).toBe(true);
    expect(prefs.bellParcels).toBe(true);
  });

  it('validates adminAlertPreferencesPatchSchema allowing partial updates', () => {
    const patch = adminAlertPreferencesPatchSchema.parse({
      emailParcels: false,
      bellPayments: false,
    });
    expect(patch.emailParcels).toBe(false);
    expect(patch.bellPayments).toBe(false);
    expect(patch.emailDisputes).toBeUndefined();
  });

  it('registers alert audit actions in adminAuditActionSchema and ADMIN_AUDIT_ACTION_LABEL', () => {
    const actions = ['alert.mark_read', 'alert.mark_all_read', 'alert.update_preferences'];
    for (const a of actions) {
      expect(adminAuditActionSchema.safeParse(a).success).toBe(true);
      expect(ADMIN_AUDIT_ACTION_LABEL[a as keyof typeof ADMIN_AUDIT_ACTION_LABEL]).toBeDefined();
    }
  });
});
