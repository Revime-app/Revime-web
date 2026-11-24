import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminComplianceItem } from '@revime/shared';
import {
  COMPLIANCE_KIND_LABELS,
  ComplianceProofDrawer,
  getComplianceKindBadge,
  signupMethodLabel,
} from '../components/compliance/ComplianceProofDrawer';
import { COMPLIANCE_KIND_OPTIONS } from '../app/conformite/page';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-06` (1)): privacy acceptances appear in the existing proofs page
 * labelled « Politique de confidentialité », and each proof shows how the account signed up.
 */
const privacyProof: AdminComplianceItem = {
  id: '00000000-0000-4000-8000-000000000009',
  userId: 'usr-9',
  userEmail: 'g@example.com',
  kind: 'PRIVACY_ACCEPTANCE',
  cguVersion: null,
  waiverTextVersion: null,
  privacyVersion: '2026-11-19',
  signupMethod: 'GOOGLE',
  legalTextSnapshot: "L'utilisateur reconnaît avoir pris connaissance de la Politique de confidentialité de REVIME et l'accepter.",
  actionProof: 'SIGNUP_COMPLETION_CHECKBOXES_TICKED',
  commandeId: null,
  ipAddress: '203.0.113.9',
  userAgent: 'UA/1',
  checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  timestamp: '2026-11-19T10:00:00.000Z',
  valid: true,
  historicalImport: false,
};

describe('privacy proofs on the dashboard', () => {
  it('labels the new kind « Politique de confidentialité » in the badge, the labels and the filter', () => {
    expect(COMPLIANCE_KIND_LABELS.PRIVACY_ACCEPTANCE).toBe('Politique de confidentialité');
    expect(getComplianceKindBadge('PRIVACY_ACCEPTANCE')).toEqual({ label: 'Politique de confidentialité', tone: 'info' });
    expect(COMPLIANCE_KIND_OPTIONS).toContainEqual({ value: 'PRIVACY_ACCEPTANCE', label: 'Politique de confidentialité' });
  });

  it('names each sign-up method in French', () => {
    expect([signupMethodLabel('APPLE'), signupMethodLabel('GOOGLE'), signupMethodLabel('EMAIL'), signupMethodLabel(null)]).toEqual([
      'Apple',
      'Google',
      'E-mail',
      'Inconnu',
    ]);
  });

  it('shows the privacy version and the sign-up method in the drawer', () => {
    const html = renderToString(<ComplianceProofDrawer proof={privacyProof} isOpen={true} onClose={() => {}} />);
    expect(html).toContain('Politique de confidentialité');
    expect(html).toContain('Confidentialité v2026-11-19');
    expect(html).toContain('Mode d&#x27;inscription');
    expect(html).toContain('Google');
  });
});
