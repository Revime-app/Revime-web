import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  BUSINESS_DECISION_MOTIF_LABEL,
  type AdminBusinessDetailsResponse,
  type AdminVerificationListItem,
} from '@revime/shared';
import {
  parseBusinessDecisionForm,
  formatFileSize,
  compareDirigeantWithIdentity,
  allowedBusinessActions,
  businessDecisionLine,
} from '../lib/business-decision';
import {
  BusinessDecisionModal,
  sendBusinessDecisionRequest,
} from '../app/verifications/BusinessDecisionModal';
import {
  BusinessDecisionPanelView,
  fetchBusinessDetails,
  sendBusinessApproveRequest,
} from '../app/verifications/BusinessDecisionPanel';
import { hasPermission } from '../lib/permissions';
import { VerificationsList } from '../app/verifications/VerificationsList';

describe('Task 5: Business Verification Decision UI & Integration (CF5-07)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Pure Helper Functions (lib/business-decision.ts)', () => {
    it('formatFileSize formats byte sizes into French human-readable units', () => {
      expect(formatFileSize(500)).toBe('500 o');
      expect(formatFileSize(1024)).toBe('1 Ko');
      expect(formatFileSize(124 * 1024)).toBe('124 Ko');
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 Mo');
      expect(formatFileSize(0)).toBe('0 o');
      expect(formatFileSize(-10)).toBe('0 o');
    });

    it('compareDirigeantWithIdentity evaluates legal representative match against Stripe verified identity', () => {
      // Unverified Stripe identity
      expect(compareDirigeantWithIdentity('Jean Dupont', null)).toEqual({
        status: 'UNVERIFIED',
        label: 'Identité non vérifiée',
        tone: 'warning',
      });
      expect(compareDirigeantWithIdentity('Jean Dupont', '')).toEqual({
        status: 'UNVERIFIED',
        label: 'Identité non vérifiée',
        tone: 'warning',
      });

      // Missing declared dirigeant name
      expect(compareDirigeantWithIdentity(null, 'Jean Dupont')).toEqual({
        status: 'MISSING',
        label: 'Non renseigné',
        tone: 'neutral',
      });
      expect(compareDirigeantWithIdentity('', 'Jean Dupont')).toEqual({
        status: 'MISSING',
        label: 'Non renseigné',
        tone: 'neutral',
      });

      // Exact & normalized matching
      expect(compareDirigeantWithIdentity('Jean Dupont', 'Jean Dupont')).toEqual({
        status: 'MATCH',
        label: 'Identique',
        tone: 'success',
      });
      expect(compareDirigeantWithIdentity('jean dupont ', ' JEAN DUPONT')).toEqual({
        status: 'MATCH',
        label: 'Identique',
        tone: 'success',
      });
      expect(compareDirigeantWithIdentity('Élise Müller', 'elise muller')).toEqual({
        status: 'MATCH',
        label: 'Identique',
        tone: 'success',
      });

      // Mismatch
      expect(compareDirigeantWithIdentity('Marie Curie', 'Jean Dupont')).toEqual({
        status: 'MISMATCH',
        label: 'Différent',
        tone: 'danger',
      });
    });

    it('allowedBusinessActions calculates available actions by verification status', () => {
      expect(allowedBusinessActions('PENDING')).toEqual({ approve: true, refuse: true, request: true });
      expect(allowedBusinessActions(null)).toEqual({ approve: true, refuse: true, request: true });
      expect(allowedBusinessActions(undefined)).toEqual({ approve: true, refuse: true, request: true });
      expect(allowedBusinessActions('APPROVED')).toEqual({ approve: false, refuse: true, request: true });
      expect(allowedBusinessActions('REJECTED')).toEqual({ approve: true, refuse: false, request: true });
      expect(allowedBusinessActions('DOCUMENTS_REQUIRED')).toEqual({ approve: true, refuse: true, request: false });
    });

    it('parseBusinessDecisionForm validates required motifs and precision rules', () => {
      // Missing motif
      expect(parseBusinessDecisionForm('', '')).toEqual({
        ok: false,
        errors: { motif: 'Choisissez un motif.' },
      });

      // OTHER motif requires non-empty note
      expect(parseBusinessDecisionForm('OTHER', '')).toEqual({
        ok: false,
        errors: { note: 'Précisez le motif pour la valeur Autre.' },
      });
      expect(parseBusinessDecisionForm('OTHER', '   ')).toEqual({
        ok: false,
        errors: { note: 'Précisez le motif pour la valeur Autre.' },
      });

      // Note limit 500 chars
      expect(parseBusinessDecisionForm('DIRIGEANT_MISMATCH', 'a'.repeat(501))).toEqual({
        ok: false,
        errors: { note: '500 caractères maximum.' },
      });

      // Standard motif without note
      expect(parseBusinessDecisionForm('DIRIGEANT_MISMATCH', '')).toEqual({
        ok: true,
        data: { motif: 'DIRIGEANT_MISMATCH' },
      });

      // Standard motif with optional note
      expect(parseBusinessDecisionForm('DOCUMENT_EXPIRED', 'Kbis datant de 2024')).toEqual({
        ok: true,
        data: { motif: 'DOCUMENT_EXPIRED', note: 'Kbis datant de 2024' },
      });

      // OTHER motif with note
      expect(parseBusinessDecisionForm('OTHER', 'Etablissement radie')).toEqual({
        ok: true,
        data: { motif: 'OTHER', note: 'Etablissement radie' },
      });
    });

    it('businessDecisionLine formats decision history with label, note, date and author', () => {
      const at = '2026-10-03T12:00:00.000Z';
      expect(
        businessDecisionLine({
          motif: 'DOCUMENT_EXPIRED',
          note: null,
          decidedAt: at,
          decidedByEmail: 'ops@revime.fr',
        }),
      ).toContain('Justificatif de plus de 3 mois');

      expect(
        businessDecisionLine({
          motif: 'OTHER',
          note: 'Signature manquante',
          decidedAt: at,
          decidedByEmail: 'admin@revime.fr',
        }),
      ).toBe('Autre motif : Signature manquante · 03/10/2026 par admin@revime.fr');

      expect(businessDecisionLine(null)).toBeNull();
      expect(businessDecisionLine({ motif: undefined as any, note: null, decidedAt: at })).toBeNull();
    });
  });

  describe('2. BusinessDecisionModal Component & API Requests', () => {
    it('renders modal in refuse mode with all motifs and refuse button', () => {
      const html = renderToString(
        <BusinessDecisionModal
          userId="usr-123"
          kind="refuse"
          onClose={() => {}}
          onDone={() => {}}
          onConflict={() => {}}
        />,
      );

      expect(html).toMatch(/Refuser la vérification d(?:'|’|&#x27;|&apos;)entreprise/);
      expect(html).toMatch(/Refuser l(?:'|’|&#x27;|&apos;)entreprise/);
      for (const label of Object.values(BUSINESS_DECISION_MOTIF_LABEL)) {
        const pattern = new RegExp(label.replace(/'/g, "(?:'|’|&#x27;|&apos;)"));
        expect(html).toMatch(pattern);
      }
      expect(html).toContain('Précision');
    });

    it('renders modal in request mode with request title and request button', () => {
      const html = renderToString(
        <BusinessDecisionModal
          userId="usr-123"
          kind="request"
          onClose={() => {}}
          onDone={() => {}}
          onConflict={() => {}}
        />,
      );

      expect(html).toContain('Demander de nouveaux documents');
      expect(html).toContain('Demander les documents');
    });

    it('sends PATCH /api/proxy/admin/verifications/business/:userId/refuse on refuse', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = mockFetch;

      const result = await sendBusinessDecisionRequest('usr-123', 'refuse', {
        motif: 'DIRIGEANT_MISMATCH',
        note: 'Le gérant ne correspond pas au titulaire Stripe.',
      });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/admin/verifications/business/usr-123/refuse',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            motif: 'DIRIGEANT_MISMATCH',
            note: 'Le gérant ne correspond pas au titulaire Stripe.',
          }),
        },
      );
    });

    it('sends PATCH /api/proxy/admin/verifications/business/:userId/request-documents on request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = mockFetch;

      const result = await sendBusinessDecisionRequest('usr-123', 'request', {
        motif: 'DOCUMENT_EXPIRED',
        note: 'Merci de fournir un extrait Kbis de moins de 3 mois.',
      });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/admin/verifications/business/usr-123/request-documents',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            motif: 'DOCUMENT_EXPIRED',
            note: 'Merci de fournir un extrait Kbis de moins de 3 mois.',
          }),
        },
      );
    });

    it('handles 409 conflict API error during decision submission', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: { message: 'Cette vérification a déjà été traitée par un autre opérateur.' },
        }),
      });

      const result = await sendBusinessDecisionRequest('usr-123', 'refuse', {
        motif: 'INVALID_SIRET',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.error).toBe('Cette vérification a déjà été traitée par un autre opérateur.');
      }
    });
  });

  describe('3. BusinessDecisionPanel View & Data Layer', () => {
    const mockDetails: AdminBusinessDetailsResponse = {
      userId: 'usr-123',
      user: {
        name: 'Jean Dupont',
        email: 'jean.dupont@example.com',
        avatarUrl: null,
        verifiedIdentityName: 'Jean Dupont',
      },
      business: {
        siren: '980491005',
        siret: '98049100500016',
        denomination: 'Atelier Dupont',
        legalForm: 'SASU',
        establishmentAddress: '12 Rue de la Paix, 75002 Paris',
        vatNumber: 'FR12980491005',
        dirigeantName: 'Jean Dupont',
        registrationProof: {
          name: 'extrait_kbis.pdf',
          sizeBytes: 124 * 1024,
          url: 'https://storage.revime.fr/proofs/kbis.pdf',
        },
        insuranceProof: {
          name: 'rc_pro_2026.pdf',
          sizeBytes: 250 * 1024,
          url: 'https://storage.revime.fr/proofs/rc_pro.pdf',
        },
        status: 'PENDING',
        submittedAt: '2026-10-01T10:00:00.000Z',
        verifiedAt: null,
      },
      decision: null,
    };

    const mockRow: AdminVerificationListItem = {
      id: 'verif-1',
      userId: 'usr-123',
      date: '2026-10-01T10:00:00.000Z',
      displayName: 'Jean Dupont',
      username: 'jdupont',
      email: 'jean.dupont@example.com',
      accountKind: 'PRO',
      type: 'BUSINESS',
      status: 'PROCESSING',
      needsAction: true,
      detail: 'Atelier Dupont',
      siren: '980491005',
      siret: '98049100500016',
      marker: null,
      identity: null,
    };

    it('fetches business details via GET /api/proxy/admin/verifications/business/:userId/details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDetails,
      });

      const res = await fetchBusinessDetails('usr-123');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.business?.denomination).toBe('Atelier Dupont');
        expect(res.data.user.verifiedIdentityName).toBe('Jean Dupont');
      }
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/proxy/admin/verifications/business/usr-123/details',
      );
    });

    it('sends PATCH /api/proxy/admin/verifications/business/:userId/approve on approval', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const res = await sendBusinessApproveRequest('usr-123');
      expect(res.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/proxy/admin/verifications/business/usr-123/approve',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    it('handles 409 conflict error when approving', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: { message: 'Cette entreprise a déjà été validée.' },
        }),
      });

      const res = await sendBusinessApproveRequest('usr-123');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(409);
        expect(res.error).toBe('Cette entreprise a déjà été validée.');
      }
    });

    it('renders full BusinessDecisionPanelView with identity comparison and documents', () => {
      const html = renderToString(
        <BusinessDecisionPanelView
          row={mockRow}
          details={mockDetails}
          loading={false}
          error={null}
          banner={null}
          canDecide={true}
          confirmingApprove={false}
          saving={false}
          modal={null}
          onClose={() => {}}
          onOpenModal={() => {}}
          onCloseModal={() => {}}
          onStartConfirmApprove={() => {}}
          onCancelConfirmApprove={() => {}}
          onApprove={() => {}}
          onModalConflict={() => {}}
          onModalDone={() => {}}
        />,
      );

      // Header & metadata
      expect(html).toContain('Atelier Dupont');
      expect(html).toContain('jean.dupont@example.com');

      // Side-by-side identity & dirigeant
      expect(html).toContain('Identité vérifiée (Stripe)');
      expect(html).toContain('Nom du dirigeant déclaré');
      expect(html).toContain('Identique');

      // Business details
      expect(html).toContain('SASU');
      expect(html).toContain('98049100500016');
      expect(html).toContain('12 Rue de la Paix, 75002 Paris');
      expect(html).toContain('FR12980491005');

      // Documents
      expect(html).toContain('extrait_kbis.pdf');
      expect(html).toContain('124 Ko');
      expect(html).toContain('rc_pro_2026.pdf');
      expect(html).toContain('250 Ko');

      // Action buttons
      expect(html).toMatch(/Valider l(?:'|’|&#x27;|&apos;)entreprise/);
      expect(html).toContain('Demander de nouveaux documents');
      expect(html).toContain('Refuser la vérification');
      expect(html).toMatch(/Voir l(?:'|’|&#x27;|&apos;)utilisateur/);
      expect(html).toContain('Fermer');
    });

    it('renders "Non fournie (facultatif)" when insurance proof is not uploaded', () => {
      const withoutInsurance: AdminBusinessDetailsResponse = {
        ...mockDetails,
        business: {
          ...mockDetails.business!,
          insuranceProof: null,
        },
      };

      const html = renderToString(
        <BusinessDecisionPanelView
          row={mockRow}
          details={withoutInsurance}
          loading={false}
          error={null}
          banner={null}
          canDecide={true}
          confirmingApprove={false}
          saving={false}
          modal={null}
          onClose={() => {}}
          onOpenModal={() => {}}
          onCloseModal={() => {}}
          onStartConfirmApprove={() => {}}
          onCancelConfirmApprove={() => {}}
          onApprove={() => {}}
          onModalConflict={() => {}}
          onModalDone={() => {}}
        />,
      );

      expect(html).toContain('Non fournie (facultatif)');
    });

    it('renders "Différent" badge when legal representative differs from Stripe name', () => {
      const mismatchDetails: AdminBusinessDetailsResponse = {
        ...mockDetails,
        business: {
          ...mockDetails.business!,
          dirigeantName: 'Claire Martin',
        },
      };

      const html = renderToString(
        <BusinessDecisionPanelView
          row={mockRow}
          details={mismatchDetails}
          loading={false}
          error={null}
          banner={null}
          canDecide={true}
          confirmingApprove={false}
          saving={false}
          modal={null}
          onClose={() => {}}
          onOpenModal={() => {}}
          onCloseModal={() => {}}
          onStartConfirmApprove={() => {}}
          onCancelConfirmApprove={() => {}}
          onApprove={() => {}}
          onModalConflict={() => {}}
          onModalDone={() => {}}
        />,
      );

      expect(html).toContain('Différent');
    });

    it('renders "Identité non vérifiée" when Stripe identity has not yet been verified', () => {
      const unverifiedDetails: AdminBusinessDetailsResponse = {
        ...mockDetails,
        user: {
          ...mockDetails.user,
          verifiedIdentityName: null,
        },
      };

      const html = renderToString(
        <BusinessDecisionPanelView
          row={mockRow}
          details={unverifiedDetails}
          loading={false}
          error={null}
          banner={null}
          canDecide={true}
          confirmingApprove={false}
          saving={false}
          modal={null}
          onClose={() => {}}
          onOpenModal={() => {}}
          onCloseModal={() => {}}
          onStartConfirmApprove={() => {}}
          onCancelConfirmApprove={() => {}}
          onApprove={() => {}}
          onModalConflict={() => {}}
          onModalDone={() => {}}
        />,
      );

      expect(html).toContain('Identité non vérifiée');
    });

    it('renders approval confirmation UI box when confirmingApprove is active', () => {
      const html = renderToString(
        <BusinessDecisionPanelView
          row={mockRow}
          details={mockDetails}
          loading={false}
          error={null}
          banner={null}
          canDecide={true}
          confirmingApprove={true}
          saving={false}
          modal={null}
          onClose={() => {}}
          onOpenModal={() => {}}
          onCloseModal={() => {}}
          onStartConfirmApprove={() => {}}
          onCancelConfirmApprove={() => {}}
          onApprove={() => {}}
          onModalConflict={() => {}}
          onModalDone={() => {}}
        />,
      );

      expect(html).toMatch(/Valider l(?:'|’|&#x27;|&apos;)entreprise \? Le profil professionnel sera activé immédiatement\./);
      expect(html).toContain('Confirmer la validation');
      expect(html).toContain('Annuler');
    });
  });

  describe('4. Permission Matrix & Access Enforcement (verification.decide)', () => {
    it('authorizes Super Admin, Admin, and Support to decide on business verifications', () => {
      expect(
        hasPermission(
          { role: 'super_admin', permissions: ['verification.decide'], twoFactorVerified: true },
          'verification.decide',
        ),
      ).toBe(true);
      expect(
        hasPermission(
          { role: 'admin', permissions: ['verification.decide'], twoFactorVerified: true },
          'verification.decide',
        ),
      ).toBe(true);
      expect(
        hasPermission(
          { role: 'support', permissions: ['verification.decide'], twoFactorVerified: true },
          'verification.decide',
        ),
      ).toBe(true);
    });

    it('denies Moderation, Finance, and Read-Only roles from deciding on verifications', () => {
      expect(
        hasPermission(
          { role: 'moderation', permissions: [], twoFactorVerified: true },
          'verification.decide',
        ),
      ).toBe(false);
      expect(
        hasPermission(
          { role: 'finance', permissions: [], twoFactorVerified: true },
          'verification.decide',
        ),
      ).toBe(false);
      expect(
        hasPermission(
          { role: 'read_only', permissions: [], twoFactorVerified: true },
          'verification.decide',
        ),
      ).toBe(false);
      expect(hasPermission(null, 'verification.decide')).toBe(false);
    });

    it('hides decision action buttons when canDecide is false', () => {
      const mockDetails: AdminBusinessDetailsResponse = {
        userId: 'usr-123',
        user: { name: 'Jean Dupont', email: 'jean@example.com', avatarUrl: null, verifiedIdentityName: 'Jean Dupont' },
        business: {
          siren: '980491005',
          siret: '98049100500016',
          denomination: 'Atelier Dupont',
          legalForm: 'SASU',
          establishmentAddress: '12 Rue de la Paix, 75002 Paris',
          vatNumber: null,
          dirigeantName: 'Jean Dupont',
          registrationProof: { name: 'kbis.pdf', sizeBytes: 1000, url: 'https://example.com/kbis.pdf' },
          insuranceProof: null,
          status: 'PENDING',
          submittedAt: '2026-10-01T10:00:00.000Z',
          verifiedAt: null,
        },
        decision: null,
      };

      const mockRow: AdminVerificationListItem = {
        id: 'verif-1',
        userId: 'usr-123',
        date: '2026-10-01T10:00:00.000Z',
        displayName: 'Jean Dupont',
        username: 'jdupont',
        email: 'jean@example.com',
        accountKind: 'PRO',
        type: 'BUSINESS',
        status: 'PROCESSING',
        needsAction: true,
        detail: null,
        siren: '980491005',
        siret: null,
        marker: null,
        identity: null,
      };

      const html = renderToString(
        <BusinessDecisionPanelView
          row={mockRow}
          details={mockDetails}
          loading={false}
          error={null}
          banner={null}
          canDecide={false}
          confirmingApprove={false}
          saving={false}
          modal={null}
          onClose={() => {}}
          onOpenModal={() => {}}
          onCloseModal={() => {}}
          onStartConfirmApprove={() => {}}
          onCancelConfirmApprove={() => {}}
          onApprove={() => {}}
          onModalConflict={() => {}}
          onModalDone={() => {}}
        />,
      );

      expect(html).not.toContain("Valider l'entreprise");
      expect(html).not.toContain('Demander de nouveaux documents');
      expect(html).not.toContain('Refuser la vérification');
      expect(html).toContain('Fermer');
      expect(html).toMatch(/Voir l(?:'|’|&#x27;|&apos;)utilisateur/);
    });
  });

  describe('5. VerificationsList Page Integration', () => {
    it('renders VerificationsList with search filters and initial loading state', () => {
      const html = renderToString(<VerificationsList />);
      expect(html).toContain('Liste des vérifications');
      expect(html).toContain('Nécessite une action');
      expect(html).toContain('Statut');
      expect(html).toContain('Type de compte');
      expect(html).toContain('SIREN / SIRET');
      expect(html).toContain('Chargement des vérifications…');
    });
  });
});
