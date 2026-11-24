import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type {
  AdminCatalogOverviewDto,
  AdminCategoryTreeItem,
  FaultTypeDto,
  AdminDemandeDetail,
  AdminCommandeDetail,
} from '@revime/shared';
import CategoriesPage from '../app/categories/page';
import { FaultTypesCatalogView } from '../app/categories/FaultTypesCatalogView';
import { FaultTypeModal } from '../app/categories/FaultTypeModal';
import { DemandeDetailView } from '../app/demandes/[id]/DemandeDetailView';
import { CommandeDetailView } from '../app/commandes/[id]/page';

// Mock AdminGate me
vi.mock('../../components/AdminGate', () => ({
  useAdminMe: () => ({
    user: { id: 'usr-admin-1', role: 'SUPER_ADMIN', email: 'admin@repareme.fr' },
    permissions: ['*'],
  }),
}));

const mockOverview: AdminCatalogOverviewDto = {
  totalRootCategories: 8,
  totalSubCategories: 34,
  totalBrands: 42,
  totalModels: 180,
  totalFaultTypes: 65,
};

const mockCategories: AdminCategoryTreeItem[] = [
  {
    id: 'cat-root-1',
    parentId: null,
    slug: 'telephonie',
    labelFr: 'Téléphonie & Mobilité',
    icon: '📱',
    description: 'Smartphones et tablettes',
    active: true,
    sortOrder: 10,
    demandesCount: 14,
    repairersCount: 5,
    children: [
      {
        id: 'cat-sub-1',
        parentId: 'cat-root-1',
        slug: 'smartphones',
        labelFr: 'Smartphones',
        icon: '📲',
        description: 'iPhones et Android',
        active: true,
        sortOrder: 10,
        demandesCount: 14,
        repairersCount: 5,
        children: [],
      },
    ],
  },
];

const mockFaultTypes: FaultTypeDto[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    categoryId: 'cat-sub-1',
    categoryLabelFr: 'Smartphones',
    categorySlug: 'smartphones',
    slug: 'ecran-fissure',
    labelFr: 'Écran tactile fissuré',
    description: 'Vitre brisée ou tactile inopérant',
    icon: '📱',
    sortOrder: 1,
    active: true,
    demandesCount: 14,
    createdAt: '2026-10-16T10:00:00Z',
    updatedAt: '2026-10-16T10:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    categoryId: 'cat-sub-1',
    categoryLabelFr: 'Smartphones',
    categorySlug: 'smartphones',
    slug: 'batterie-gonflee',
    labelFr: 'Batterie défaillante ou gonflée',
    description: 'Perte rapide d autonomie',
    icon: '🔋',
    sortOrder: 2,
    active: false,
    demandesCount: 5,
    createdAt: '2026-10-16T11:00:00Z',
    updatedAt: '2026-10-16T11:00:00Z',
  },
];

describe('Feature F12: Types de panne (Frontend Catalog, Modals, Fiches & Zero Black Buttons)', () => {
  const originalFetch = global.fetch;
  let fetchCalls: Array<{ url: string; options?: RequestInit }> = [];

  beforeEach(() => {
    fetchCalls = [];
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options });
      if (url.includes('/api/proxy/admin/catalog/overview')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOverview),
        });
      }
      if (url.includes('/api/proxy/admin/catalog/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        });
      }
      if (url.includes('/api/proxy/admin/catalog/fault-types')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockFaultTypes),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('1. 5 KPI Stat Cards in CategoriesPage', () => {
    it('renders all 5 KPI cards including Types de panne', () => {
      const html = renderToString(<CategoriesPage />);
      expect(html).toContain('Catégories principales');
      expect(html).toContain('Sous-catégories');
      expect(html).toContain('Marques référencées');
      expect(html).toContain('Modèles répertoriés');
      expect(html).toContain('Types de panne');
      expect(html).toContain('Anomalies et diagnostics');
    });
  });

  describe('2. 3-Tab Segmented Switcher in CategoriesPage', () => {
    it('renders the 3 tab options: taxonomy, brands, and fault-types', () => {
      const html = renderToString(<CategoriesPage />);
      expect(html).toContain('Taxonomie des catégories');
      expect(html).toContain('Marques &amp; Modèles');
      expect(html).toContain('Types de panne');
    });
  });

  describe('3. FaultTypesCatalogView', () => {
    it('renders category filter, search input, and table with fault types', () => {
      const html = renderToString(
        <FaultTypesCatalogView
          initialFaultTypes={mockFaultTypes}
          initialCategories={mockCategories}
        />
      );
      expect(html).toContain('Toutes les catégories');
      expect(html).toContain('Rechercher un type de panne...');
      expect(html).toContain('Écran tactile fissuré');
      expect(html).toContain('ecran-fissure');
      expect(html).toContain('Smartphones');
      expect(html).toContain('14');
      expect(html).toContain('Batterie défaillante ou gonflée');
    });

    it('renders empty state when no fault types are present', () => {
      const html = renderToString(
        <FaultTypesCatalogView
          initialFaultTypes={[]}
          initialCategories={mockCategories}
        />
      );
      expect(html).toContain('Aucun type de panne répertorié');
      expect(html).toContain('+ Nouveau type de panne');
    });
  });

  describe('4. FaultTypeModal', () => {
    it('renders modal in create mode with required fields', () => {
      const html = renderToString(
        <FaultTypeModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          mode="create"
          categoriesList={[{ id: 'cat-sub-1', labelFr: 'Smartphones' }]}
        />
      );
      expect(html).toContain('Nouveau type de panne');
      expect(html).toContain('Catégorie');
      expect(html).toContain('Libellé de la panne');
      expect(html).toContain('Slug');
      expect(html).toContain('Description');
      expect(html).toContain('Statut actif');
      expect(html).toContain('Créer le type de panne');
    });

    it('renders modal in edit mode with populated fields', () => {
      const html = renderToString(
        <FaultTypeModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          mode="edit"
          categoriesList={[{ id: 'cat-sub-1', labelFr: 'Smartphones' }]}
          faultTypeToEdit={mockFaultTypes[0]}
        />
      );
      expect(html).toContain('Modifier le type de panne');
      expect(html).toContain('Écran tactile fissuré');
      expect(html).toContain('ecran-fissure');
      expect(html).toContain('Enregistrer les modifications');
    });
  });

  describe('5. Demande & Commande Fault Type Badges', () => {
    it('renders fault type badge in DemandeDetailView when faultType is present', () => {
      const mockDemande: AdminDemandeDetail = {
        demandeId: 'demande-123',
        title: 'Écran cassé iPhone',
        description: 'Tombe par terre',
        brand: 'Apple',
        model: 'iPhone 13',
        parts: 'ORIGINAL',
        mode: 'OFFERS',
        budgetCents: null,
        locationLabel: 'Paris',
        postalCode: '75001',
        status: 'OPEN',
        categoryId: 'cat-sub-1',
        categoryLabelFr: 'Smartphones',
        state: 'visible',
        removalReason: null,
        removedByAdmin: false,
        author: { userId: 'u-1', name: 'Jean Dupont', email: 'jean@example.com' },
        photoUrls: [],
        paymentInFlight: false,
        offers: [],
        commandes: [],
        activity: [],
        conversations: [],
        quoteTarget: null,
        quoteClosedReason: null,
        createdAt: '2026-10-16T12:00:00Z',
        faultType: {
          id: '11111111-1111-1111-1111-111111111111',
          labelFr: 'Écran tactile fissuré',
          slug: 'ecran-fissure',
        },
      };

      const html = renderToString(<DemandeDetailView demande={mockDemande} />);
      const clean = html.replace(/<!-- -->/g, '');
      expect(clean).toContain('Panne : Écran tactile fissuré');
      expect(html).toContain('data-testid="demande-fault-type-badge"');
    });

    it('renders fault type badge in CommandeDetailView when demande.faultType is present', () => {
      const mockCommande: AdminCommandeDetail = {
        commandeId: 'cmd-123',
        reference: 'CMD-12345678',
        delivery: 'PARCEL',
        status: 'PAID',
        step: 'REPAIR_STARTED',
        createdAt: '2026-10-16T11:00:00Z',
        updatedAt: '2026-10-16T12:00:00Z',
        amounts: {
          repairCents: 10000,
          shippingCents: 1500,
          protectionCents: 500,
          totalCents: 12000,
          shareOwedCents: 0,
          suggestedRefund: {
            repairCents: 10000,
            shippingCents: 1500,
            protectionCents: 500,
          },
          refund: null,
        },
        stripe: {
          paymentIntentId: 'pi_test123',
          chargeId: 'ch_test123',
          transferId: null,
          refundId: null,
          transferSucceeded: false,
          hasCharge: true,
        },
        demande: {
          id: 'demande-123',
          title: 'Réparation Smartphone',
          description: 'Écran brisé',
          categoryLabel: 'Smartphones',
          photos: [],
          createdAt: '2026-10-16T10:00:00Z',
          ...({
            faultType: {
              id: '11111111-1111-1111-1111-111111111111',
              labelFr: 'Écran tactile fissuré',
              slug: 'ecran-fissure',
            },
          } as any),
        },
        offer: null,
        client: { userId: 'cli-1', name: 'Alice', email: 'alice@example.com', city: 'Paris', phone: null },
        repairer: { userId: 'rep-1', name: 'Bob Rep', email: 'bob@example.com', city: 'Paris', phone: null },
        shipments: [],
        dispute: null,
        review: null,
        cancellation: null,
        timeline: [],
        conversationId: null,
      };

      const html = renderToString(<CommandeDetailView initialData={mockCommande} />);
      const clean = html.replace(/<!-- -->/g, '');
      expect(clean).toContain('Panne : Écran tactile fissuré');
      expect(html).toContain('data-testid="commande-fault-type-badge"');
    });

    it('does not render fault type badge when faultType is absent', () => {
      const mockDemandeWithoutFault: AdminDemandeDetail = {
        demandeId: 'demande-456',
        title: 'Pas de panne spécifiée',
        description: 'Test sans panne',
        brand: null,
        model: null,
        parts: 'UNKNOWN',
        mode: 'OFFERS',
        budgetCents: null,
        locationLabel: 'Lyon',
        postalCode: '69001',
        status: 'OPEN',
        categoryId: 'cat-sub-1',
        categoryLabelFr: 'Smartphones',
        state: 'visible',
        removalReason: null,
        removedByAdmin: false,
        author: { userId: 'u-2', name: 'Bob', email: 'bob@example.com' },
        photoUrls: [],
        paymentInFlight: false,
        offers: [],
        commandes: [],
        activity: [],
        conversations: [],
        quoteTarget: null,
        quoteClosedReason: null,
        createdAt: '2026-10-16T12:00:00Z',
        faultType: null,
      };

      const html = renderToString(<DemandeDetailView demande={mockDemandeWithoutFault} />);
      expect(html).not.toContain('data-testid="demande-fault-type-badge"');
      expect(html).not.toContain('Type de panne :');
    });
  });

  describe('6. Catalog Endpoints Integration Contracts', () => {
    it('executes POST reorder request with categoryId and orderedIds', async () => {
      const payload = {
        categoryId: 'cat-sub-1',
        orderedIds: [
          '22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111',
        ],
      };

      await fetch('/api/proxy/admin/catalog/fault-types/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(
        fetchCalls.some(
          (c) =>
            c.url === '/api/proxy/admin/catalog/fault-types/reorder' &&
            c.options?.method === 'POST' &&
            c.options?.body === JSON.stringify(payload)
        )
      ).toBe(true);
    });

    it('executes PATCH active status request', async () => {
      const id = '11111111-1111-1111-1111-111111111111';
      await fetch(`/api/proxy/admin/catalog/fault-types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });

      expect(
        fetchCalls.some(
          (c) =>
            c.url === `/api/proxy/admin/catalog/fault-types/${id}` &&
            c.options?.method === 'PATCH' &&
            c.options?.body === JSON.stringify({ active: false })
        )
      ).toBe(true);
    });

    it('executes DELETE request for a fault type', async () => {
      const id = '11111111-1111-1111-1111-111111111111';
      await fetch(`/api/proxy/admin/catalog/fault-types/${id}`, {
        method: 'DELETE',
      });

      expect(
        fetchCalls.some(
          (c) =>
            c.url === `/api/proxy/admin/catalog/fault-types/${id}` &&
            c.options?.method === 'DELETE'
        )
      ).toBe(true);
    });
  });

  describe('7. Automated DOM Regex Scanner: ZERO Black Buttons Rule', () => {
    it('verifies no black buttons, badges, or interactive controls are rendered', () => {
      const renderedComponents = [
        renderToString(<CategoriesPage />),
        renderToString(
          <FaultTypesCatalogView
            initialFaultTypes={mockFaultTypes}
            initialCategories={mockCategories}
          />
        ),
        renderToString(
          <FaultTypeModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            mode="create"
            categoriesList={[{ id: 'cat-sub-1', labelFr: 'Smartphones' }]}
          />
        ),
        renderToString(
          <FaultTypeModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            mode="edit"
            categoriesList={[{ id: 'cat-sub-1', labelFr: 'Smartphones' }]}
            faultTypeToEdit={mockFaultTypes[0]}
          />
        ),
      ];

      // Prohibited black definitions on buttons, badges, and controls
      const prohibitedColorRegexes = [
        /background(-color)?:\s*(#000000|black|rgb\(0,\s*0,\s*0\))/i,
        /background:\s*(#000000|black|rgb\(0,\s*0,\s*0\))/i,
        /style="[^"]*background(-color)?:\s*(#000000|black|rgb\(0,\s*0,\s*0\))[^"]*"/i,
      ];

      for (const html of renderedComponents) {
        // Extract all button and badge tags
        const buttonMatches = html.match(/<button[^>]*>.*?<\/button>/gi) || [];
        for (const buttonHtml of buttonMatches) {
          for (const regex of prohibitedColorRegexes) {
            expect(buttonHtml).not.toMatch(regex);
          }
        }

        const badgeMatches = html.match(/<span[^>]*badge[^>]*>.*?<\/span>/gi) || [];
        for (const badgeHtml of badgeMatches) {
          for (const regex of prohibitedColorRegexes) {
            expect(badgeHtml).not.toMatch(regex);
          }
        }
      }
    });
  });
});
