import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminComplianceItem, AdminComplianceVerifyResponse } from '@revime/shared';
import { hasPermission } from '../lib/permissions';
import {
  ComplianceProofDrawer,
  sendVerifyComplianceProofRequest,
  getComplianceKindBadge,
  getIntegrityBadge,
  COMPLIANCE_KIND_LABELS,
  formatDateFr,
} from '../components/compliance/ComplianceProofDrawer';
import {
  ConformitePageView,
  ComplianceTable,
  fetchComplianceProofs,
  COMPLIANCE_KIND_OPTIONS,
} from '../app/conformite/page';

describe('Task 4: Compliance Audit Trail Viewer & Drawer UI (/conformite)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const sampleProof1: AdminComplianceItem = {
    id: '00000000-0000-4000-8000-000000000001',
    userId: 'usr-client-1',
    userEmail: 'client1@revime.fr',
    kind: 'CGU_ACCEPTANCE',
    cguVersion: '2026-09-04',
    waiverTextVersion: null,
    legalTextSnapshot: "L'utilisateur reconnaît avoir pris connaissance des Conditions Générales d'Utilisation de REVIME et les accepter.",
    actionProof: 'AUTH_REGISTER_CHECKBOX',
    commandeId: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    timestamp: '2026-10-10T14:30:00.000Z',
    valid: true,
    historicalImport: false,
  };

  const sampleProof2: AdminComplianceItem = {
    id: '00000000-0000-4000-8000-000000000002',
    userId: 'usr-client-2',
    userEmail: 'client2@revime.fr',
    kind: 'WITHDRAWAL_WAIVER_IMMEDIATE',
    cguVersion: null,
    waiverTextVersion: '2026-10-06',
    legalTextSnapshot: "Je demande expressément l'exécution immédiate de la prestation de réparation avant l'expiration du délai légal de rétractation de 14 jours, et renonce expressément à mon droit de rétractation dès que la prestation aura été pleinement exécutée.",
    actionProof: 'COMMANDE_CHECKOUT_WAIVER_CHECKBOX',
    commandeId: 'cmd-999',
    ipAddress: '82.65.10.20',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    checksum: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    timestamp: '2026-10-11T09:15:00.000Z',
    valid: true,
    historicalImport: false,
  };

  const sampleProof3: AdminComplianceItem = {
    id: '00000000-0000-4000-8000-000000000003',
    userId: 'usr-client-3',
    userEmail: null,
    kind: 'WITHDRAWAL_WAIVER_WAIT_14_DAYS',
    cguVersion: null,
    waiverTextVersion: '2026-10-06',
    legalTextSnapshot: 'Je souhaite bénéficier du délai légal de rétractation de 14 jours avant le début de la réparation.',
    actionProof: 'COMMANDE_CHECKOUT_WAIT_CHOICE',
    commandeId: 'cmd-1000',
    ipAddress: null,
    userAgent: null,
    checksum: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    timestamp: '2026-10-11T10:00:00.000Z',
    valid: false,
    historicalImport: false,
  };

  describe('1. Role Gate & Permissions Enforcement', () => {
    it('authorizes super_admin and admin with 2FA to access compliance registry', () => {
      expect(
        hasPermission(
          { role: 'super_admin', permissions: ['compliance.read'], twoFactorVerified: true },
          'compliance.read',
        ),
      ).toBe(true);
      expect(
        hasPermission(
          { role: 'admin', permissions: ['compliance.read'], twoFactorVerified: true },
          'compliance.read',
        ),
      ).toBe(true);
    });

    it('denies access to non-admin roles and unverified sessions', () => {
      expect(
        hasPermission(
          { role: 'moderation', permissions: [], twoFactorVerified: true },
          'compliance.read',
        ),
      ).toBe(false);
      expect(
        hasPermission(
          { role: 'support', permissions: [], twoFactorVerified: true },
          'compliance.read',
        ),
      ).toBe(false);
      expect(
        hasPermission(
          { role: 'finance', permissions: [], twoFactorVerified: true },
          'compliance.read',
        ),
      ).toBe(false);
      expect(
        hasPermission(
          { role: 'read_only', permissions: [], twoFactorVerified: true },
          'compliance.read',
        ),
      ).toBe(false);
      expect(
        hasPermission(
          { role: 'super_admin', permissions: ['compliance.read'], twoFactorVerified: false },
          'compliance.read',
        ),
      ).toBe(false);
      expect(hasPermission(null, 'compliance.read')).toBe(false);
    });
  });

  describe('2. Pure Formatting & Badges Helpers', () => {
    it('formats kind badges with proper labels and tones', () => {
      const cgu = getComplianceKindBadge('CGU_ACCEPTANCE');
      expect(cgu.label).toBe('Acceptation CGU');
      expect(cgu.tone).toBe('info');

      const waiverImm = getComplianceKindBadge('WITHDRAWAL_WAIVER_IMMEDIATE');
      expect(waiverImm.label).toBe('Renonciation immédiate (rétractation)');
      expect(waiverImm.tone).toBe('warning');

      const waiverWait = getComplianceKindBadge('WITHDRAWAL_WAIVER_WAIT_14_DAYS');
      expect(waiverWait.label).toBe('Délai légal (attente 14 jours)');
      expect(waiverWait.tone).toBe('neutral');
    });

    it('formats integrity badge (valid vs invalid)', () => {
      const valid = getIntegrityBadge(true, false);
      expect(valid.label).toBe('Empreinte valide');
      expect(valid.tone).toBe('success');

      const invalid = getIntegrityBadge(false, false);
      expect(invalid.label).toBe('Empreinte invalide');
      expect(invalid.tone).toBe('danger');

      // A backfilled row is unchanged since its import but is NOT a contemporaneous proof.
      const imported = getIntegrityBadge(true, true);
      expect(imported.label).toBe('Import historique');
      expect(imported.tone).toBe('warning');
      // A changed imported row is still tampered.
      expect(getIntegrityBadge(false, true).tone).toBe('danger');
    });

    it('formats french dates correctly', () => {
      const formatted = formatDateFr('2026-10-10T14:30:00.000Z');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('10');
    });
  });

  describe('3. ComplianceTable Component', () => {
    it('renders empty message when no proofs are available', () => {
      const html = renderToString(<ComplianceTable items={[]} onInspect={() => {}} />);
      expect(html).toContain('Aucune preuve de conformité ne correspond à ces critères.');
    });

    it('renders data table with horodatage, utilisateur, kind, action, commande, and integrity pills', () => {
      const html = renderToString(
        <ComplianceTable items={[sampleProof1, sampleProof2, sampleProof3]} onInspect={() => {}} />,
      );

      // Column headers
      expect(html).toContain('Horodatage');
      expect(html).toContain('Utilisateur');
      expect(html).toContain('Type de preuve');
      expect(html).toContain('Action');
      expect(html).toContain('Commande');
      expect(html).toContain('Intégrité');

      // Row 1
      expect(html).toContain('client1@revime.fr');
      expect(html).toContain('usr-client-1');
      expect(html).toContain('Acceptation CGU');
      expect(html).toContain('AUTH_REGISTER_CHECKBOX');
      expect(html).toContain('Empreinte valide');

      // Row 2
      expect(html).toContain('client2@revime.fr');
      expect(html).toContain('cmd-999');
      expect(html).toContain('Renonciation immédiate (rétractation)');
      expect(html).toContain('COMMANDE_CHECKOUT_WAIVER_CHECKBOX');

      // Row 3
      expect(html).toContain('usr-client-3');
      expect(html).toContain('Délai légal (attente 14 jours)');
      expect(html).toContain('Empreinte invalide');

      // Inspect buttons
      expect(html).toContain('Inspecter');
    });
  });

  describe('4. ComplianceProofDrawer Component', () => {
    it('does not render anything when isOpen is false or proof is null', () => {
      const htmlClosed = renderToString(
        <ComplianceProofDrawer proof={sampleProof1} isOpen={false} onClose={() => {}} />,
      );
      expect(htmlClosed).toBe('');

      const htmlNull = renderToString(
        <ComplianceProofDrawer proof={null} isOpen={true} onClose={() => {}} />,
      );
      expect(htmlNull).toBe('');
    });

    it('renders header, metadata section, legal snapshot callout, and SHA-256 section', () => {
      const html = renderToString(
        <ComplianceProofDrawer proof={sampleProof1} isOpen={true} onClose={() => {}} />,
      );

      // Header
      expect(html).toContain('Preuve #00000000-0000-4000-8000-000000000001');
      expect(html).toContain('Acceptation CGU');
      expect(html).toContain('Fermer le panneau de preuve');

      // Section 1: Identité & Métadonnées
      expect(html).toContain('1. Identité &amp; Métadonnées');
      expect(html).toContain('ID Utilisateur');
      expect(html).toContain('usr-client-1');
      expect(html).toContain('E-mail utilisateur');
      expect(html).toContain('client1@revime.fr');
      expect(html).toContain('Adresse IP');
      expect(html).toContain('192.168.1.1');
      expect(html).toContain('User Agent');
      expect(html).toContain('Mozilla/5.0');
      expect(html).toContain('CGU v2026-09-04');
      expect(html).toContain('AUTH_REGISTER_CHECKBOX');

      // Section 2: Instantané textuel verbatim
      expect(html).toContain('2. Instantané textuel verbatim');
      expect(html).toContain('utilisateur reconnaît avoir pris connaissance des Conditions Générales');

      // Section 3: Intégrité cryptographique SHA-256
      expect(html).toContain('3. Intégrité cryptographique SHA-256');
      expect(html).toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(html).toContain('Copier');
      expect(html).toMatch(/Vérifier l(?:'|’|&#x27;|&apos;)empreinte/);
      expect(html).toContain('Avis d’intégrité &amp; Traçabilité légale');
      expect(html).toContain('Code de la consommation (art. L. 221-18');
      expect(html).toContain('Directive européenne 2011/83/UE');
    });

    it('renders order id and waiver version when present on withdrawal waiver proof', () => {
      const html = renderToString(
        <ComplianceProofDrawer proof={sampleProof2} isOpen={true} onClose={() => {}} />,
      );

      expect(html).toContain('cmd-999');
      expect(html).toContain('Dérogation v2026-10-06');
      expect(html).toContain('COMMANDE_CHECKOUT_WAIVER_CHECKBOX');
      expect(html).toContain('renonce expressément à mon droit de rétractation');
    });
  });

  describe('5. Live Verification API & Drawer Integration', () => {
    it('dispatches POST /api/proxy/admin/compliance/proofs/:id/verify on verification click', async () => {
      const mockResponse: AdminComplianceVerifyResponse = {
        id: sampleProof1.id,
        valid: true,
        historicalImport: false,
        calculatedChecksum: sampleProof1.checksum,
        storedChecksum: sampleProof1.checksum,
        verifiedAt: '2026-10-11T12:00:00.000Z',
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      global.fetch = mockFetch;

      const result = await sendVerifyComplianceProofRequest(sampleProof1.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.valid).toBe(true);
        expect(result.data.calculatedChecksum).toBe(sampleProof1.checksum);
      }
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/proxy/admin/compliance/proofs/${sampleProof1.id}/verify`,
        { method: 'POST' },
      );
    });

    it('handles verification API failure gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Preuve introuvable.' } }),
      });

      const result = await sendVerifyComplianceProofRequest('non-existent-id');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Preuve introuvable.');
      }
    });
  });

  describe('6. Data Fetching & Query Parameters', () => {
    it('fetches compliance proofs list with search query, kind and pagination', async () => {
      const mockListResponse = {
        items: [sampleProof1],
        total: 1,
        page: 1,
        totalPages: 1,
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockListResponse,
      });
      global.fetch = mockFetch;

      const result = await fetchComplianceProofs({
        q: 'client1@revime.fr',
        kind: 'CGU_ACCEPTANCE',
        page: 1,
        limit: 20,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.total).toBe(1);
      }
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/admin/compliance/proofs?q=client1%40revime.fr&kind=CGU_ACCEPTANCE&page=1&limit=20',
      );
    });

    it('handles fetch list API failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Erreur interne.' }),
      });

      const result = await fetchComplianceProofs({ page: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Erreur interne.');
      }
    });
  });

  describe('7. ConformitePageView Full View Component', () => {
    it('renders title, legal subtitle, search bar, kind dropdown, table, and pagination', () => {
      const html = renderToString(
        <ConformitePageView
          items={[sampleProof1, sampleProof2]}
          total={2}
          page={1}
          totalPages={1}
          loading={false}
          error={null}
          searchInput=""
          kindFilter=""
          onSearchInputChange={() => {}}
          onKindFilterChange={() => {}}
          onSubmitFilter={() => {}}
          onPageChange={() => {}}
          onInspect={() => {}}
        />,
      );

      // Title & subtitle
      expect(html).toContain('Conformité');
      expect(html).toContain('Code de la consommation art. L. 221-18 et Directive UE 2011/83/UE');

      // Filters
      expect(html).toContain('Recherche');
      expect(html).toContain('Type de preuve');
      for (const opt of COMPLIANCE_KIND_OPTIONS) {
        expect(html).toContain(opt.label);
      }
      expect(html).toContain('Filtrer');

      // Table contents
      expect(html).toContain('client1@revime.fr');
      expect(html).toContain('client2@revime.fr');

      // Pagination
      expect(html).toContain('2 preuves au total · Page 1 sur 1');
      expect(html).toContain('Précédent');
      expect(html).toContain('Suivant');
    });

    it('renders loading state when loading is true', () => {
      const html = renderToString(
        <ConformitePageView
          items={[]}
          total={0}
          page={1}
          totalPages={1}
          loading={true}
          error={null}
          searchInput=""
          kindFilter=""
          onSearchInputChange={() => {}}
          onKindFilterChange={() => {}}
          onSubmitFilter={() => {}}
          onPageChange={() => {}}
          onInspect={() => {}}
        />,
      );

      expect(html).toContain('Chargement des preuves de conformité…');
    });

    it('renders error alert when error is present', () => {
      const html = renderToString(
        <ConformitePageView
          items={[]}
          total={0}
          page={1}
          totalPages={1}
          loading={false}
          error="Erreur lors de la récupération."
          searchInput=""
          kindFilter=""
          onSearchInputChange={() => {}}
          onKindFilterChange={() => {}}
          onSubmitFilter={() => {}}
          onPageChange={() => {}}
          onInspect={() => {}}
        />,
      );

      expect(html).toContain('Erreur lors de la récupération.');
    });
  });
});
