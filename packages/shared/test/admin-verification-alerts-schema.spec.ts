import { describe, expect, it } from 'vitest';
import {
  adminVerificationAlertSchema,
  adminVerificationAlertsResponseSchema,
  adminVerificationAlertTypeSchema,
  adminVerificationAlertSeveritySchema,
} from '../src/admin.schemas.js';

describe('A-3: Admin Verification Alerts Schemas', () => {
  it('validates all 6 alert types', () => {
    const types = [
      'MALFORMED_NIF',
      'DUPLICATE_IBAN',
      'DUPLICATE_NIF',
      'NO_NIF_OVER_25',
      'PARTICULAR_QUOTA_80_PERCENT',
      'SIRET_MISMATCH',
    ] as const;

    for (const t of types) {
      expect(adminVerificationAlertTypeSchema.parse(t)).toBe(t);
    }
    // Exactly these: « différent de Stripe Identity » is not built (ISS-052), so no type for it.
    expect([...adminVerificationAlertTypeSchema.options]).toEqual([...types]);

    expect(() => adminVerificationAlertTypeSchema.parse('INVALID_TYPE')).toThrow();
  });

  it('validates severities CRITICAL and WARNING', () => {
    expect(adminVerificationAlertSeveritySchema.parse('CRITICAL')).toBe('CRITICAL');
    expect(adminVerificationAlertSeveritySchema.parse('WARNING')).toBe('WARNING');
    expect(() => adminVerificationAlertSeveritySchema.parse('INFO')).toThrow();
  });

  it('validates a valid alert matching mockup page9_img2.png', () => {
    const raw = {
      id: 'alert-1',
      type: 'MALFORMED_NIF',
      severity: 'CRITICAL',
      title: 'NIF mal formé · Jordan B.',
      detail: '« 12345 » : 13 chiffres attendus, commençant par 0, 1, 2 ou 3.',
      userId: 'usr-jordan-1',
      userName: 'Jordan B.',
      userHref: '/utilisateurs/usr-jordan-1',
    };

    const parsed = adminVerificationAlertSchema.parse(raw);
    expect(parsed.id).toBe('alert-1');
    expect(parsed.type).toBe('MALFORMED_NIF');
    expect(parsed.severity).toBe('CRITICAL');
    expect(parsed.title).toContain('Jordan B.');
  });

  it('validates alerts response array and total count', () => {
    const response = {
      alerts: [
        {
          id: 'alert-1',
          type: 'MALFORMED_NIF',
          severity: 'CRITICAL',
          title: 'NIF mal formé · Jordan B.',
          detail: '« 12345 » : 13 chiffres attendus, commençant par 0, 1, 2 ou 3.',
          userId: 'usr-jordan-1',
          userName: 'Jordan B.',
          userHref: '/utilisateurs/usr-jordan-1',
        },
        {
          id: 'alert-2',
          type: 'PARTICULAR_QUOTA_80_PERCENT',
          severity: 'WARNING',
          title: '80 % du plafond particulier · Camille Martin',
          detail: '8 missions et 1 140 € sur 12 mois.',
          userId: 'usr-camille-1',
          userName: 'Camille Martin',
          userHref: '/utilisateurs/usr-camille-1',
        },
      ],
      totalCount: 2,
    };

    const parsed = adminVerificationAlertsResponseSchema.parse(response);
    expect(parsed.totalCount).toBe(2);
    expect(parsed.alerts).toHaveLength(2);
  });
});
