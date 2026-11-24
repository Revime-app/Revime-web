import { describe, it, expect } from 'vitest';
import {
  adminUserFiscalAuditEntrySchema,
  adminUserFiscalDataSchema,
  adminUserFiscalRemindResponseSchema,
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
  ADMIN_AUDIT_DOMAINS,
  type AdminUserFiscalData,
  type AdminUserDetail,
} from '../src/index.js';

describe('Admin User Fiscal Schemas (A-1)', () => {
  it('validates a complete fiscal audit entry', () => {
    const entry = {
      id: 'log-123',
      fieldName: 'address',
      oldValue: '10 rue de la Paix',
      newValue: '12 rue des Lilas',
      changedAt: '2026-10-12T14:30:00.000Z',
    };
    const parsed = adminUserFiscalAuditEntrySchema.parse(entry);
    expect(parsed.id).toBe('log-123');
    expect(parsed.fieldName).toBe('address');
    expect(parsed.oldValue).toBe('10 rue de la Paix');
    expect(parsed.newValue).toBe('12 rue des Lilas');
  });

  it('validates complete fiscal data for an individual repairer', () => {
    const data: AdminUserFiscalData = {
      isComplete: true,
      legalName: 'Camille Martin',
      birthDate: '14/03/1995',
      address: '12 rue des Lilas, 69003 Lyon',
      nif: '0123456789012',
      hasNoNif: false,
      birthCity: null,
      birthCountry: null,
      siret: null,
      vatNumber: null,
      maskedIban: '•••• 0412',
      reminderCount: 1,
      lastReminderAt: '2026-10-03T10:00:00.000Z',
      auditLogs: [
        {
          id: 'log-1',
          fieldName: 'nif',
          oldValue: null,
          newValue: '0123456789012',
          changedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
    };

    const parsed = adminUserFiscalDataSchema.parse(data);
    expect(parsed.isComplete).toBe(true);
    expect(parsed.legalName).toBe('Camille Martin');
    expect(parsed.maskedIban).toBe('•••• 0412');
    expect(parsed.auditLogs).toHaveLength(1);
  });

  it('validates incomplete fiscal data with hasNoNif fallback', () => {
    const data: AdminUserFiscalData = {
      isComplete: false,
      legalName: 'Camille Martin',
      birthDate: '14/03/1995',
      address: '12 rue des Lilas, 69003 Lyon',
      nif: null,
      hasNoNif: true,
      birthCity: null,
      birthCountry: null,
      siret: null,
      vatNumber: null,
      maskedIban: '•••• 0412',
      reminderCount: 0,
      lastReminderAt: null,
      auditLogs: [],
    };

    const parsed = adminUserFiscalDataSchema.parse(data);
    expect(parsed.isComplete).toBe(false);
    expect(parsed.hasNoNif).toBe(true);
    expect(parsed.birthCity).toBeNull();
  });

  it('validates remind response schema', () => {
    const res = {
      success: true,
      reminderCount: 2,
      lastReminderAt: '2026-10-17T10:30:00.000Z',
    };
    const parsed = adminUserFiscalRemindResponseSchema.parse(res);
    expect(parsed.success).toBe(true);
    expect(parsed.reminderCount).toBe(2);
  });

  it('registers user.fiscal_remind in audit actions, label, and USERS domain', () => {
    expect(adminAuditActionSchema.options).toContain('user.fiscal_remind');
    expect(ADMIN_AUDIT_ACTION_LABEL['user.fiscal_remind']).toBe('Relance fiscale individuelle');
    expect(ADMIN_AUDIT_DOMAINS.USERS.actions).toContain('user.fiscal_remind');
  });
});
