import { describe, expect, it } from 'vitest';
import type { MeResponse } from '../src/user.schemas.js';
import { verificationRows, hasSufficientIdentity, mayVerifyBusiness } from '../src/verification-rows.js';

function mockMe(overrides?: {
  verificationLevel?: 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';
  kind?: 'INDIVIDUAL' | 'PRO' | null;
  repairerEnabled?: boolean;
  completion?: { completed: number; total: number; items: Record<string, boolean> } | null;
}): MeResponse {
  return {
    id: 'user_1',
    email: 'test@example.com',
    name: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    username: 'testuser',
    phone: '+33612345678',
    emailVerified: true,
    phoneVerified: true,
    verificationRequired: true,
    identityRequired: true,
    role: 'user',
    banned: false,
    banReason: null,
    connectEnabled: true,
    payoutsConfigured: false,
    profile: {
      userId: 'user_1',
      avatarPath: null,
      avatarUrl: null,
      bannerPath: null,
      bannerUrl: null,
      clientEnabled: true,
      repairerEnabled: overrides?.repairerEnabled ?? true,
      activeMode: 'REPAIRER',
      verificationLevel: overrides?.verificationLevel ?? 'BASIC',
      verifiedAt: new Date().toISOString(),
      postalCode: '75001',
      city: 'Paris',
      lat: 48.8566,
      lng: 2.3522,
      locationRadiusKm: 20,
    },
    repairer: {
      userId: 'user_1',
      displayName: 'Atelier Test',
      bio: 'Reparation rapide',
      kind: overrides?.kind ?? 'PRO',
      categoryIds: ['cat_1'],
      address: null,
      availabilities: [],
      completion: overrides?.completion ?? {
        completed: 6,
        total: 6,
        items: {
          photo: true,
          banner: true,
          description: true,
          categories: true,
          zone: true,
          availability: true,
        },
      },
    },
  };
}

describe('verificationRows', () => {
  it('returns Identité: Vérifiée and Informations professionnelles: À faire when level is IDENTITY for PRO', () => {
    const me = mockMe({ verificationLevel: 'IDENTITY', kind: 'PRO' });
    const rows = verificationRows(me, null);

    expect(rows[0]).toEqual({
      key: 'identity',
      label: 'Identité',
      status: 'Vérifiée',
      tone: 'ok',
      body: 'Votre identité est vérifiée.',
    });
    expect(rows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'À faire',
      tone: 'muted',
      body: 'Vérifiez votre SIREN ou SIRET pour afficher le badge « Professionnel vérifié ».',
    });
    expect(rows[2]).toEqual({
      key: 'repairer',
      label: 'Profil réparateur',
      status: 'Actif',
      tone: 'ok',
      body: 'Votre profil réparateur est complet.',
    });
  });

  it('returns Informations professionnelles: À faire when me is stale at BASIC but identityStatus is VERIFIED for PRO', () => {
    // CF5-06: The session is at BASIC, but live identity status is VERIFIED without operator refusal
    const me = mockMe({ verificationLevel: 'BASIC', kind: 'PRO' });
    const rows = verificationRows(me, 'VERIFIED');

    expect(rows[0]?.status).toBe('Vérifiée');
    expect(rows[0]?.tone).toBe('ok');
    expect(rows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'À faire',
      tone: 'muted',
      body: 'Vérifiez votre SIREN ou SIRET pour afficher le badge « Professionnel vérifié ».',
    });
  });

  it('returns Informations professionnelles: Non concerné for INDIVIDUAL even if identity is verified', () => {
    const me = mockMe({ verificationLevel: 'IDENTITY', kind: 'INDIVIDUAL' });
    const rows = verificationRows(me, null);

    expect(rows[0]?.status).toBe('Vérifiée');
    expect(rows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'Non concerné',
      tone: 'muted',
      body: "Cette étape s'applique uniquement aux professionnels.",
    });
  });

  it('returns Informations professionnelles: Vérifiée when level is BUSINESS', () => {
    const me = mockMe({ verificationLevel: 'BUSINESS', kind: 'PRO' });
    const rows = verificationRows(me, 'VERIFIED');

    expect(rows[0]?.status).toBe('Vérifiée');
    expect(rows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'Vérifiée',
      tone: 'ok',
      body: 'Votre entreprise est vérifiée. Le badge « Professionnel vérifié » s\'affiche sur vos offres.',
    });
  });

  it('respects operator refusal over VERIFIED identityStatus', () => {
    const me = mockMe({ verificationLevel: 'BASIC', kind: 'PRO' });
    const rows = verificationRows(me, 'VERIFIED', 'REFUSED');

    expect(rows[0]).toEqual({
      key: 'identity',
      label: 'Identité',
      status: 'Refusée',
      tone: 'warn',
      body: 'REVIME a refusé votre vérification. Vous pouvez recommencer.',
    });
    // For refused identity, business step stays Non concerné / blocked
    expect(rows[1]?.status).toBe('Non concerné');
  });

  it('respects DOCUMENTS_REQUESTED operator decision over VERIFIED identityStatus', () => {
    const me = mockMe({ verificationLevel: 'BASIC', kind: 'PRO' });
    const rows = verificationRows(me, 'VERIFIED', 'DOCUMENTS_REQUESTED');

    expect(rows[0]).toEqual({
      key: 'identity',
      label: 'Identité',
      status: 'Nouveaux documents demandés',
      tone: 'warn',
      body: 'REVIME vous demande de nouveaux documents. Vous pouvez recommencer.',
    });
    expect(rows[1]?.status).toBe('Non concerné');
  });

  it('returns appropriate business row status when businessStatus is provided', () => {
    const me = mockMe({ verificationLevel: 'IDENTITY', kind: 'PRO' });

    const pendingRows = verificationRows(me, 'VERIFIED', null, 'PENDING');
    expect(pendingRows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'Vérification en cours',
      tone: 'warn',
      body: "Votre dossier d'entreprise est en cours d'examen par nos équipes.",
    });

    const rejectedRows = verificationRows(me, 'VERIFIED', null, 'REJECTED');
    expect(rejectedRows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'Refusée',
      tone: 'warn',
      body: "Votre vérification d'entreprise a été refusée. Vous pouvez soumettre un nouveau dossier.",
    });

    const docReqRows = verificationRows(me, 'VERIFIED', null, 'DOCUMENTS_REQUIRED');
    expect(docReqRows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'Documents à renvoyer',
      tone: 'warn',
      body: 'Des pièces complémentaires sont nécessaires pour valider votre entreprise.',
    });

    const approvedRows = verificationRows(me, 'VERIFIED', null, 'APPROVED');
    expect(approvedRows[1]).toEqual({
      key: 'business',
      label: 'Informations professionnelles',
      status: 'Vérifiée',
      tone: 'ok',
      body: 'Votre entreprise est vérifiée. Le badge « Professionnel vérifié » s\'affiche sur vos offres.',
    });
  });
});

describe('hasSufficientIdentity & mayVerifyBusiness', () => {
  it('returns true when level is IDENTITY or BUSINESS', () => {
    const meIdentity = mockMe({ verificationLevel: 'IDENTITY' });
    const meBusiness = mockMe({ verificationLevel: 'BUSINESS' });
    const meBasic = mockMe({ verificationLevel: 'BASIC' });

    expect(hasSufficientIdentity(meIdentity)).toBe(true);
    expect(hasSufficientIdentity(meBusiness)).toBe(true);
    expect(hasSufficientIdentity(meBasic)).toBe(false);

    expect(mayVerifyBusiness(meIdentity)).toBe(true);
    expect(mayVerifyBusiness(meBusiness)).toBe(true);
    expect(mayVerifyBusiness(meBasic)).toBe(false);
  });

  it('returns true when level is BASIC but identityStatus is VERIFIED without refusal', () => {
    const meBasic = mockMe({ verificationLevel: 'BASIC' });

    expect(hasSufficientIdentity(meBasic, 'VERIFIED', null)).toBe(true);
    expect(mayVerifyBusiness(meBasic, 'VERIFIED', null)).toBe(true);

    // Operator refused -> false
    expect(hasSufficientIdentity(meBasic, 'VERIFIED', 'REFUSED')).toBe(false);
    expect(mayVerifyBusiness(meBasic, 'VERIFIED', 'REFUSED')).toBe(false);

    // Operator requested documents -> false
    expect(hasSufficientIdentity(meBasic, 'VERIFIED', 'DOCUMENTS_REQUESTED')).toBe(false);
    expect(mayVerifyBusiness(meBasic, 'VERIFIED', 'DOCUMENTS_REQUESTED')).toBe(false);
  });
});
