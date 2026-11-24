import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminUserDetail, AdminDemandeDetail } from '@revime/shared';

let mockInitialViewState: any = null;

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (promiseOrContext: any) => {
      if (promiseOrContext && typeof promiseOrContext.then === 'function') {
        // synchronously unwrapped for test
        return { id: 'test-id-123' };
      }
      return actual.use(promiseOrContext);
    },
    useState: (initial: any) => {
      if (
        mockInitialViewState &&
        initial &&
        typeof initial === 'object' &&
        'state' in initial &&
        initial.state === 'loading'
      ) {
        return [mockInitialViewState, vi.fn()];
      }
      return actual.useState(initial);
    },
  };
});

import ParametresPage from '../app/parametres/page';
import UtilisateurFichePage from '../app/utilisateurs/[id]/page';
import DemandeFichePage from '../app/demandes/[id]/page';

vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({
    role: 'super_admin',
    permissions: ['verification.decide', 'users.moderate', 'admin.manage', 'content.moderate'],
    twoFactorVerified: true,
  }),
}));

vi.mock('../lib/auth-client', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'admin-1',
        email: 'superadmin@revime.fr',
        name: 'Super Admin',
        firstName: 'Super',
        lastName: 'Admin',
      },
    },
    refetch: vi.fn(),
  }),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  twoFactor: {
    enable: vi.fn(),
    verifyTotp: vi.fn(),
  },
}));

function extractColumns(html: string): { left: string; right: string } {
  const leftMatch = html.split('data-testid="detail-grid-left">')[1];
  expect(leftMatch).toBeDefined();
  const left = leftMatch.split('data-testid="detail-grid-right">')[0];
  const right = html.split('data-testid="detail-grid-right">')[1];
  expect(right).toBeDefined();
  return { left, right };
}

describe('UI2 - Detail Pages in Responsive 2-Column Layout', () => {
  beforeEach(() => {
    mockInitialViewState = null;
  });

  it('ParametresPage: renders in full-width 2-column layout with strict column segregation', () => {
    const html = renderToString(<ParametresPage />);

    // 1. Root page container uses .page--detail
    expect(html).toContain('class="page page--detail page--settings"');

    // 2. Contains .detail-grid
    expect(html).toContain('class="detail-grid"');

    // 3. Strict 2-column segregation
    const { left, right } = extractColumns(html);

    // Left column contains Profil form & Sécurité
    expect(left).toContain('aria-labelledby="settings-profile"');
    expect(left).toContain('aria-labelledby="settings-security"');
    expect(left).not.toContain('aria-labelledby="settings-account"');
    expect(left).not.toContain('aria-labelledby="settings-session"');

    // Right column contains Account summary & Session controls
    expect(right).toContain('aria-labelledby="settings-account"');
    expect(right).toContain('aria-labelledby="settings-session"');
    expect(right).toContain('superadmin@revime.fr');
    expect(right).toContain('Se déconnecter');
    expect(right).not.toContain('aria-labelledby="settings-profile"');
    expect(right).not.toContain('aria-labelledby="settings-security"');
  });

  it('UtilisateurFichePage: renders 2-column layout with strict segregation of info (left) vs actions (right) and top back link', () => {
    const mockUserDetail: AdminUserDetail = {
      userId: 'usr-test-123',
      createdAt: '2026-09-01T10:00:00.000Z',
      identity: {
        name: 'Alice Client',
        firstName: 'Alice',
        lastName: 'Client',
        username: 'alice_c',
      },
      contact: {
        email: 'alice@example.com',
        emailVerified: true,
        phone: '+33612345678',
        phoneVerified: true,
      },
      account: {
        clientEnabled: true,
        repairerEnabled: false,
        activeMode: 'CLIENT',
        role: null,
      },
      verificationLevel: 'IDENTITY',
      status: { kind: 'active' },
      counts: {
        demandes: 3,
        repairsPerformed: 0,
        repairsReceived: 2,
        reviewsReceived: 0,
        reviewsWritten: 2,
        reportsAgainst: 0,
        reportsMade: 0,
      },
      history: [],
      summaryKpis: {
        demandesCount: 3,
        repairsCompletedCount: 0,
        totalSpentCents: 15000,
        totalRevenueCents: 0,
        averageRating: null,
        reviewCount: 0,
        disputesCount: 0,
        reportsCount: 0,
      },
      internalNotes: [],
      repairer: null,
      fiscal: null,
      particularQuota: null,
      identityDecision: null,
      staffRole: null,
      marker: null,
    };

    mockInitialViewState = { state: 'loaded', data: mockUserDetail };

    const paramsPromise = Promise.resolve({ id: 'usr-test-123' });
    const html = renderToString(<UtilisateurFichePage params={paramsPromise} />);

    // Root wrapper and navigation
    expect(html).toContain('class="page page--detail"');
    expect(html).toContain('class="detail-grid"');
    expect(html).toContain('← Retour aux utilisateurs');

    // Strict 2-column segregation
    const { left, right } = extractColumns(html);

    // Left column contains information & history cards
    expect(left).toContain('Identité');
    expect(left).toContain('Coordonnées');
    expect(left).toContain('Compte');
    expect(left).toContain('Activité');
    expect(left).toContain('Historique d&#x27;activité');
    expect(left).not.toContain('Actions</h2>');
    expect(left).not.toContain('Suspendre le compte');

    // Right column contains moderation and admin controls
    expect(right).toContain('Actions</h2>');
    expect(right).toContain('Suspendre le compte');
    expect(right).not.toContain('Coordonnées');
    expect(right).not.toContain('Historique d&#x27;activité');
  });

  it('DemandeFichePage: renders 2-column layout with strict segregation of content/orders (left) vs author/actions (right) and top back link', () => {
    const mockDemandeDetail: AdminDemandeDetail = {
      demandeId: 'demande-test-123',
      createdAt: '2026-09-01T10:00:00.000Z',
      title: 'Écran iPhone 13 cassé',
      description: 'Écran fissuré suite à une chute',
      brand: 'Apple',
      model: 'iPhone 13',
      parts: 'ORIGINAL',
      mode: 'OFFERS',
      budgetCents: null,
      locationLabel: 'Paris 11e',
      postalCode: '75011',
      categoryLabelFr: 'Smartphones',
      categoryId: 'cat-smartphones',
      status: 'OPEN',
      quoteTarget: null,
      quoteClosedReason: null,
      state: 'visible',
      removedByAdmin: false,
      removalReason: null,
      photoUrls: [],
      author: {
        userId: 'usr-client-1',
        name: 'Alice Client',
        email: 'alice@example.com',
      },
      offers: [],
      commandes: [],
      activity: [],
      conversations: [],
      paymentInFlight: false,
    };

    mockInitialViewState = { state: 'loaded', data: mockDemandeDetail };

    const paramsPromise = Promise.resolve({ id: 'demande-test-123' });
    const html = renderToString(<DemandeFichePage params={paramsPromise} />);

    // Root wrapper and navigation
    expect(html).toContain('class="page page--detail"');
    expect(html).toContain('class="detail-grid"');
    expect(html).toContain('← Retour aux demandes');

    // Strict 2-column segregation
    const { left, right } = extractColumns(html);

    // Left column contains content, offers, orders, activity
    expect(left).toContain('Contenu</h2>');
    expect(left).toContain('Écran iPhone 13 cassé');
    expect(left).toContain('Offres</h2>');
    expect(left).toContain('Commandes</h2>');
    expect(left).toContain('Historique d&#x27;activité</h2>');
    expect(left).not.toContain('Auteur</h2>');
    expect(left).not.toContain('Actions</h2>');

    // Right column contains author & actions
    expect(right).toContain('Auteur</h2>');
    expect(right).toContain('Alice Client');
    expect(right).toContain('Actions</h2>');
    expect(right).toContain('Masquer la demande');
    expect(right).toContain('Supprimer la demande');
    expect(right).not.toContain('Commandes</h2>');
    expect(right).not.toContain('Historique d&#x27;activité</h2>');
  });
});
