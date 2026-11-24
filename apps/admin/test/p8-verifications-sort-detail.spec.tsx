import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { AdminVerificationListItem } from '@revime/shared';
import { VerificationsList, VerificationsTableView } from '../app/verifications/VerificationsList';

describe('P8: Verifications List sortOrder by age & rich detail formatting', () => {
  describe('VerificationsList filter form controls & design tokens', () => {
    it('renders sortOrder selector dropdown with asc/desc options defaulting to oldest first', () => {
      const html = renderToString(<VerificationsList />);

      expect(html).toContain('for="verifications-sort-order"');
      expect(html).toContain('Trier par');
      expect(html).toContain('id="verifications-sort-order"');
      expect(html).toContain('value="asc"');
      expect(html).toContain("Plus ancien d&#x27;abord (priorité)");
      expect(html).toContain('value="desc"');
      expect(html).toContain("Plus récent d&#x27;abord");
    });

    it('styles primary search button with Bleu Ink var(--navy, #25324f) and zero black buttons', () => {
      const html = renderToString(<VerificationsList />);

      expect(html).toContain('var(--navy, #25324f)');
      expect(html).not.toContain('var(--ink, #141414)');
      expect(html).toContain('Rechercher');
    });

    it('applies Google Sans typography to root container', () => {
      const html = renderToString(<VerificationsList />);

      expect(html).toContain('var(--font-google-sans), Arial, sans-serif');
    });
  });

  describe('VerificationsTableView rich contextual detail formatting', () => {
    const baseItem: AdminVerificationListItem = {
      id: 'row-1',
      userId: 'usr-1',
      date: '2026-08-16T14:00:00.000Z',
      displayName: 'Alexandre Martin',
      username: 'amartin',
      email: 'alexandre@example.fr',
      accountKind: 'PRO',
      type: 'IDENTITY',
      status: 'DOCUMENTS_REQUIRED',
      needsAction: true,
      detail: 'Documents à refaire — justificatif non conforme ou illisible',
      siren: null,
      siret: null,
      marker: null,
      identity: null,
    };

    it('renders rich detail for identity documents required row directly (zero bare dash)', () => {
      const html = renderToString(<VerificationsTableView items={[baseItem]} />);

      expect(html).toContain('Documents à refaire — justificatif non conforme ou illisible');
    });

    it('renders rich detail for fraud signal row directly', () => {
      const fraudItem: AdminVerificationListItem = {
        ...baseItem,
        id: 'row-fraud',
        detail: 'Signal selfie / anomalie biométrique (Signal de fraude)',
      };
      const html = renderToString(<VerificationsTableView items={[fraudItem]} />);

      expect(html).toContain('Signal selfie / anomalie biométrique (Signal de fraude)');
    });

    it('renders rich detail for business verified establishment row', () => {
      const bizVerifiedItem: AdminVerificationListItem = {
        ...baseItem,
        id: 'row-biz-1',
        type: 'BUSINESS',
        status: 'VERIFIED',
        needsAction: false,
        detail: 'Établissement vérifié au registre des entreprises',
        siren: '123456789',
        siret: '12345678900012',
      };
      const html = renderToString(<VerificationsTableView items={[bizVerifiedItem]} />);

      expect(html).toContain('Établissement vérifié au registre des entreprises');
    });

    it('renders rich detail for SIRET mismatch alert row', () => {
      const mismatchItem: AdminVerificationListItem = {
        ...baseItem,
        id: 'row-mismatch',
        type: 'BUSINESS',
        status: 'PROCESSING',
        needsAction: true,
        detail: 'Écart détecté entre SIRET déclaré et justificatif',
        siren: '808359764',
        siret: '80835976400020',
      };
      const html = renderToString(<VerificationsTableView items={[mismatchItem]} />);

      expect(html).toContain('Écart détecté entre SIRET déclaré et justificatif');
    });

    it('renders rich detail for pending business notice row', () => {
      const pendingItem: AdminVerificationListItem = {
        ...baseItem,
        id: 'row-pending',
        type: 'BUSINESS',
        status: 'PROCESSING',
        needsAction: true,
        detail: 'Avis de situation SIRET déposé — en attente de décision',
        siren: '808359764',
        siret: '80835976400020',
      };
      const html = renderToString(<VerificationsTableView items={[pendingItem]} />);

      expect(html).toContain('Avis de situation SIRET déposé — en attente de décision');
    });

    it('renders rich detail for business documents requested row', () => {
      const docsReqItem: AdminVerificationListItem = {
        ...baseItem,
        id: 'row-docs',
        type: 'BUSINESS',
        status: 'DOCUMENTS_REQUIRED',
        needsAction: false,
        detail: 'Pièces complémentaires demandées au réparateur',
        siren: '808359764',
        siret: '80835976400020',
      };
      const html = renderToString(<VerificationsTableView items={[docsReqItem]} />);

      expect(html).toContain('Pièces complémentaires demandées au réparateur');
    });

    it('falls back to dash only when detail is explicitly null or empty', () => {
      const emptyDetailItem: AdminVerificationListItem = {
        ...baseItem,
        id: 'row-empty',
        detail: null,
      };
      const html = renderToString(<VerificationsTableView items={[emptyDetailItem]} />);

      expect(html).toContain('>—</td>');
    });
  });
});
