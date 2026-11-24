import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminBusinessDetailsResponse, AdminVerificationListItem } from '@revime/shared';
import { BusinessDecisionPanelView } from '../app/verifications/BusinessDecisionPanel';

describe('Bug B4: SIRET mismatch alert & legal form code mapping in BusinessDecisionPanel', () => {
  const baseRow: AdminVerificationListItem = {
    id: 'verif-b4',
    userId: 'usr-klimane',
    date: '2026-09-08T10:00:00.000Z',
    displayName: 'Malek KLIMANE',
    username: 'mklimane',
    email: 'malek.klimane@example.com',
    accountKind: 'PRO',
    type: 'BUSINESS',
    status: 'PROCESSING',
    needsAction: true,
    detail: 'Entreprise Malek KLIMANE',
    siret: '80835976400020',
    siren: '808359764',
    marker: null,
    identity: null,
  };

  const defaultProps = {
    row: baseRow,
    loading: false,
    error: null,
    banner: null,
    canDecide: true,
    confirmingApprove: false,
    saving: false,
    modal: null,
    onClose: () => {},
    onOpenModal: () => {},
    onCloseModal: () => {},
    onStartConfirmApprove: () => {},
    onCancelConfirmApprove: () => {},
    onApprove: () => {},
    onModalConflict: () => {},
    onModalDone: () => {},
  };

  it('renders a red mismatch alert when declared SIRET does not match SIRET in uploaded document filename', () => {
    // Malek KLIMANE scenario from client feedback screenshot page4_img2:
    // Declared SIRET: 80835976400020
    // Uploaded filename: Avis_de_situation_97923317800040_08_09_2026 08_57_43.pdf
    // Legal form: 8310
    const details: AdminBusinessDetailsResponse = {
      userId: 'usr-klimane',
      user: {
        name: 'Malek KLIMANE',
        email: 'malek.klimane@example.com',
        avatarUrl: null,
        verifiedIdentityName: 'Malek KLIMANE',
      },
      business: {
        siren: '808359764',
        siret: '80835976400020',
        denomination: 'Entreprise Malek KLIMANE',
        legalForm: '8310',
        establishmentAddress: '15 Avenue de la République, 75011 Paris',
        vatNumber: null,
        dirigeantName: 'Malek KLIMANE',
        registrationProof: {
          name: 'Avis_de_situation_97923317800040_08_09_2026 08_57_43.pdf',
          sizeBytes: 154 * 1024,
          url: 'https://storage.revime.fr/proofs/avis.pdf',
        },
        insuranceProof: null,
        status: 'PENDING',
        submittedAt: '2026-09-08T08:57:43.000Z',
        verifiedAt: null,
      },
      decision: null,
    };

    const html = renderToString(
      <BusinessDecisionPanelView
        {...defaultProps}
        details={details}
      />,
    );

    // 1. Red Alert for SIRET discrepancy
    expect(html).toContain('Discordance SIRET détectée');
    expect(html).toContain('97923317800040');
    expect(html).toContain('80835976400020');
    expect(html).toContain('Discordance justificatif');

    // 2. Legal form code '8310' mapped to French label
    expect(html).toContain("Comité social économique d’entreprise");
    // Should NOT just display raw "8310" without label
    expect(html).not.toMatch(/<strong>\s*8310\s*<\/strong>/);
  });

  it('does NOT render a mismatch alert when declared SIRET matches the filename', () => {
    const details: AdminBusinessDetailsResponse = {
      userId: 'usr-matching',
      user: {
        name: 'Alexandre Martin',
        email: 'alexandre.martin@example.com',
        avatarUrl: null,
        verifiedIdentityName: 'Alexandre Martin',
      },
      business: {
        siren: '808359764',
        siret: '80835976400020',
        denomination: 'Atelier Martin',
        legalForm: '5710',
        establishmentAddress: '10 Rue de Lyon, 75012 Paris',
        vatNumber: null,
        dirigeantName: 'Alexandre Martin',
        registrationProof: {
          name: 'kbis_80835976400020.pdf',
          sizeBytes: 120 * 1024,
          url: 'https://storage.revime.fr/proofs/kbis.pdf',
        },
        insuranceProof: null,
        status: 'PENDING',
        submittedAt: '2026-09-08T08:57:43.000Z',
        verifiedAt: null,
      },
      decision: null,
    };

    const html = renderToString(
      <BusinessDecisionPanelView
        {...defaultProps}
        details={details}
      />,
    );

    expect(html).not.toContain('Discordance SIRET détectée');
    expect(html).not.toContain('Discordance justificatif');
    // Maps 5710 to SAS
    expect(html).toContain('SAS, société par actions simplifiée');
  });

  it('does NOT render a mismatch alert when filename is generic (no SIRET inside)', () => {
    const details: AdminBusinessDetailsResponse = {
      userId: 'usr-generic',
      user: {
        name: 'Claire Dupont',
        email: 'claire.dupont@example.com',
        avatarUrl: null,
        verifiedIdentityName: 'Claire Dupont',
      },
      business: {
        siren: '808359764',
        siret: '80835976400020',
        denomination: 'Atelier Dupont',
        legalForm: 'Micro-entreprise / Auto-entrepreneur',
        establishmentAddress: '5 Rue Victor Hugo, 69002 Lyon',
        vatNumber: null,
        dirigeantName: 'Claire Dupont',
        registrationProof: {
          name: 'justificatif_immatriculation.pdf',
          sizeBytes: 90 * 1024,
          url: 'https://storage.revime.fr/proofs/justif.pdf',
        },
        insuranceProof: null,
        status: 'PENDING',
        submittedAt: '2026-09-08T08:57:43.000Z',
        verifiedAt: null,
      },
      decision: null,
    };

    const html = renderToString(
      <BusinessDecisionPanelView
        {...defaultProps}
        details={details}
      />,
    );

    expect(html).not.toContain('Discordance SIRET détectée');
    expect(html).toContain('Micro-entreprise / Auto-entrepreneur');
  });
});
