import { describe, it, expect } from 'vitest';
import {
  adminUserRepairerMetricsSchema,
  adminUserDeletionMetaSchema,
  adminUserSummaryKpisSchema,
  adminUserInternalNoteSchema,
  adminInternalNoteInputSchema,
  adminSendUserEmailSchema,
} from '../src/admin.schemas.js';

describe('P5 schemas', () => {
  it('validates repairer metrics', () => {
    const valid = { rating: 4.8, reviewCount: 12, repairsCount: 34, totalRevenueCents: 450000 };
    expect(adminUserRepairerMetricsSchema.parse(valid)).toEqual(valid);
  });

  it('validates repairer metrics with null rating and zero stats', () => {
    const valid = { rating: null, reviewCount: 0, repairsCount: 0, totalRevenueCents: 0 };
    expect(adminUserRepairerMetricsSchema.parse(valid)).toEqual(valid);
  });

  it('validates deletion metadata', () => {
    const valid = {
      deletedAt: new Date().toISOString(),
      deletedReason: 'Demande RGPD',
      deletedBy: 'admin@revime.fr',
    };
    expect(adminUserDeletionMetaSchema.parse(valid)).toEqual(valid);
  });

  it('validates deletion metadata with nullable fields', () => {
    const valid = {
      deletedAt: new Date().toISOString(),
      deletedReason: null,
      deletedBy: null,
    };
    expect(adminUserDeletionMetaSchema.parse(valid)).toEqual(valid);
  });
});

describe('P6 schemas', () => {
  it('validates user summary KPIs', () => {
    const valid = {
      demandesCount: 5,
      repairsCompletedCount: 3,
      totalSpentCents: 15000,
      totalRevenueCents: 45000,
      averageRating: 4.5,
      reviewCount: 8,
      disputesCount: 1,
      reportsCount: 0,
    };
    expect(adminUserSummaryKpisSchema.parse(valid)).toEqual(valid);
  });

  it('validates user summary KPIs with null rating and zero values', () => {
    const valid = {
      demandesCount: 0,
      repairsCompletedCount: 0,
      totalSpentCents: 0,
      totalRevenueCents: 0,
      averageRating: null,
      reviewCount: 0,
      disputesCount: 0,
      reportsCount: 0,
    };
    expect(adminUserSummaryKpisSchema.parse(valid)).toEqual(valid);
  });

  it('validates user internal note item', () => {
    const valid = {
      id: 'note-1',
      authorName: 'Admin Sarah',
      authorEmail: 'sarah@revime.fr',
      content: 'Client sérieux, aucun antécédent.',
      createdAt: new Date().toISOString(),
    };
    expect(adminUserInternalNoteSchema.parse(valid)).toEqual(valid);
  });

  it('validates internal note input constraints', () => {
    expect(adminInternalNoteInputSchema.parse({ content: '  Compte vérifié manuellement.  ' })).toEqual({
      content: 'Compte vérifié manuellement.',
    });
    expect(() => adminInternalNoteInputSchema.parse({ content: ' ' })).toThrow();
    expect(() => adminInternalNoteInputSchema.parse({ content: 'a' })).toThrow();
    expect(() => adminInternalNoteInputSchema.parse({ content: 'x'.repeat(2001) })).toThrow();
  });

  it('validates send user email input constraints', () => {
    const valid = {
      subject: 'Informations concernant votre compte',
      message: 'Bonjour, veuillez nous fournir un justificatif de domicile.',
    };
    expect(adminSendUserEmailSchema.parse(valid)).toEqual(valid);

    expect(() => adminSendUserEmailSchema.parse({ subject: 'Hi', message: 'Hello world' })).toThrow();
    expect(() => adminSendUserEmailSchema.parse({ subject: 'Valid subject', message: 'Hi' })).toThrow();
    expect(() => adminSendUserEmailSchema.parse({ subject: 'x'.repeat(201), message: 'Valid message' })).toThrow();
    expect(() => adminSendUserEmailSchema.parse({ subject: 'Valid subject', message: 'x'.repeat(5001) })).toThrow();
  });
});

