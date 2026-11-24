import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { AdminUserListItem, AdminUserListResponse } from '@revime/shared';

let stateCallIndex = 0;
let mockStateMap: Record<number, any> = {};

function setPageTestState(view: any, statut = '', type = '') {
  mockStateMap = {
    0: view,
    1: '',      // q
    2: statut,  // statut
    3: type,    // type
    4: '',      // niveau
    5: 1,       // page
  };
}

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: any) => {
      const idx = stateCallIndex++;
      if (idx in mockStateMap) {
        return [mockStateMap[idx], vi.fn()];
      }
      return actual.useState(initial);
    },
  };
});

import UtilisateursPage from '../app/utilisateurs/page';

describe('P5: /utilisateurs Table Views (Repairers Metrics & Deleted Accounts)', () => {
  beforeEach(() => {
    stateCallIndex = 0;
    mockStateMap = {};
  });

  it('renders repairer metrics columns when repairerView is active', () => {
    const repairerItem: AdminUserListItem = {
      userId: 'rep-1',
      name: 'Jean Réparateur',
      username: 'jeanrep',
      email: 'jean@repareme.fr',
      phone: '+33611223344',
      createdAt: '2026-06-01T10:00:00.000Z',
      status: { kind: 'active' },
      modes: { client: false, repairer: true },
      verificationLevel: 'BUSINESS',
      marker: null,
      staffRole: null,
      repairer: {
        displayName: 'Atelier Jean',
        publicBadge: 'BUSINESS',
        suspended: false,
        postalCode: '75011',
      },
      repairerMetrics: {
        rating: 4.8,
        reviewCount: 12,
        repairsCount: 34,
        totalRevenueCents: 450000,
      },
    };

    const data: AdminUserListResponse = {
      items: [repairerItem],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    setPageTestState({ state: 'loaded', data }, '', 'reparateur');
    stateCallIndex = 0;
    const html = renderToString(<UtilisateursPage />);

    // Verify 8 columns for repairers view
    expect(html).toContain('<th>Nom</th>');
    expect(html).toContain('<th>E-mail</th>');
    expect(html).toContain('<th>Note</th>');
    expect(html).toContain('<th>Réparations</th>');
    expect(html).toContain('<th>Chiffre d&#x27;affaires</th>');
    expect(html).toContain('<th>Badge public</th>');
    expect(html).toContain('<th>Statut réparateur</th>');
    expect(html).toContain('<th>Inscrit le</th>');

    // Verify row values
    expect(html).toContain('Atelier Jean');
    expect(html).toContain('jean@repareme.fr');
    expect(html).toContain('lucide-star');
    expect(html.replace(/<!-- -->/g, '')).toContain('4.8 (12)');
    expect(html).toContain('<td>34</td>');
    // Normalize spaces for currency check
    const normalizedHtml = html.replace(/\u202F|\u00A0/g, ' ');
    expect(normalizedHtml).toContain('4 500,00 €');
    expect(html).toContain('Professionnel vérifié');
    expect(html).toContain('Actif');
  });

  it('renders "—" for note when repairer has no reviews', () => {
    const repairerItem: AdminUserListItem = {
      userId: 'rep-2',
      name: 'Nouveau Réparateur',
      username: 'nouveaurep',
      email: 'nouveau@repareme.fr',
      phone: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      status: { kind: 'active' },
      modes: { client: false, repairer: true },
      verificationLevel: 'BASIC',
      marker: null,
      staffRole: null,
      repairer: {
        displayName: 'Nouveau Atelier',
        publicBadge: null,
        suspended: false,
        postalCode: '69001',
      },
      repairerMetrics: {
        rating: null,
        reviewCount: 0,
        repairsCount: 0,
        totalRevenueCents: 0,
      },
    };

    const data: AdminUserListResponse = {
      items: [repairerItem],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    setPageTestState({ state: 'loaded', data }, '', 'reparateur');
    stateCallIndex = 0;
    const html = renderToString(<UtilisateursPage />);

    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<td>0</td>');
    const normalizedHtml = html.replace(/\u202F|\u00A0/g, ' ');
    expect(normalizedHtml).toContain('0,00 €');
  });

  it('renders dedicated deleted users table when statut=supprime', () => {
    const deletedItem: AdminUserListItem = {
      userId: 'del-1',
      name: 'Marc Ancien',
      username: 'marcanc',
      email: 'marc@example.fr',
      phone: null,
      createdAt: '2026-01-15T10:00:00.000Z',
      status: { kind: 'deleted', at: '2026-09-01T12:00:00.000Z' },
      modes: { client: false, repairer: false },
      verificationLevel: 'NONE',
      marker: null,
      staffRole: null,
      deletionMeta: {
        deletedAt: '2026-09-01T12:00:00.000Z',
        deletedReason: 'Demande RGPD confirmée',
        deletedBy: 'admin@revime.fr',
      },
    };

    const data: AdminUserListResponse = {
      items: [deletedItem],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    setPageTestState({ state: 'loaded', data }, 'supprime', '');
    stateCallIndex = 0;
    const html = renderToString(<UtilisateursPage />);

    // Verify 5 columns for deleted users view
    expect(html).toContain('<th>Nom</th>');
    expect(html).toContain('<th>E-mail / Identifiant</th>');
    expect(html).toContain('<th>Motif de suppression</th>');
    expect(html).toContain('<th>Auteur de la suppression (admin)</th>');
    expect(html).toContain('<th>Supprimé le</th>');

    // Verify row values
    expect(html).toContain('Marc Ancien');
    expect(html).toContain('(Compte supprimé)');
    expect(html).toContain('marc@example.fr');
    expect(html).toContain('Demande RGPD confirmée');
    expect(html).toContain('admin@revime.fr');
  });

  it('renders "Non spécifié" and "—" when deletion metadata has null values', () => {
    const deletedItem: AdminUserListItem = {
      userId: 'del-2',
      name: 'Inconnu Supprimé',
      username: 'inconnu',
      email: 'deleted+del2@revime.invalid',
      phone: null,
      createdAt: '2026-01-15T10:00:00.000Z',
      status: { kind: 'deleted', at: '2026-09-01T12:00:00.000Z' },
      modes: { client: false, repairer: false },
      verificationLevel: 'NONE',
      marker: null,
      staffRole: null,
      deletionMeta: {
        deletedAt: '2026-09-01T12:00:00.000Z',
        deletedReason: null,
        deletedBy: null,
      },
    };

    const data: AdminUserListResponse = {
      items: [deletedItem],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    setPageTestState({ state: 'loaded', data }, 'supprime', '');
    stateCallIndex = 0;
    const html = renderToString(<UtilisateursPage />);

    expect(html).toContain('Non spécifié');
    expect(html).toContain('—');
  });

  it('renders standard table when viewing clients / default', () => {
    const clientItem: AdminUserListItem = {
      userId: 'cli-1',
      name: 'Claire Client',
      username: 'clairec',
      email: 'claire@example.fr',
      phone: '+33699887766',
      createdAt: '2026-07-15T10:00:00.000Z',
      status: { kind: 'active' },
      modes: { client: true, repairer: false },
      verificationLevel: 'BASIC',
      marker: null,
      staffRole: null,
    };

    const data: AdminUserListResponse = {
      items: [clientItem],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    setPageTestState({ state: 'loaded', data }, '', 'client');
    stateCallIndex = 0;
    const html = renderToString(<UtilisateursPage />);

    expect(html).toContain('<th>Nom</th>');
    expect(html).toContain('<th>Identifiant</th>');
    expect(html).toContain('<th>Coordonnées</th>');
    expect(html).toContain('<th>Compte</th>');
    expect(html).toContain('<th>Niveau</th>');
    expect(html).toContain('<th>Statut</th>');
    expect(html).toContain('<th>Inscrit le</th>');
    expect(html).toContain('clairec');
    expect(html).toContain('claire@example.fr · +33699887766');
    expect(html).toContain('Client');
  });
});
