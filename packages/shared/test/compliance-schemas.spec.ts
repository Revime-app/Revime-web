import { describe, expect, it } from 'vitest';
import {
  CANONICAL_CGU_ACCEPTANCE_TEXT,
  computeConsentChecksum,
  consentProofKindSchema,
  consentProofSchema,
  createConsentProofInputSchema,
  CURRENT_CGU_VERSION,
  CURRENT_WITHDRAWAL_WAIVER_VERSION,
  legacyImportChecksum,
  verifyConsentProofChecksum,
} from '../src/compliance.schemas.js';
import {
  adminComplianceListQuerySchema,
  adminComplianceItemSchema,
  adminComplianceListResponseSchema,
  adminComplianceVerifyResponseSchema,
  ADMIN_PERMISSIONS,
  ROLE_PERMISSIONS,
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
} from '../src/index.js';

describe('compliance shared schemas and checksum calculation', () => {
  it('exports canonical legal constants', () => {
    expect(CURRENT_CGU_VERSION).toBe('2026-10-10');
    expect(CURRENT_WITHDRAWAL_WAIVER_VERSION).toBe('2026-10-06');
    expect(CANONICAL_CGU_ACCEPTANCE_TEXT).toContain("Conditions Générales d'Utilisation");
  });

  it('validates consent proof kinds', () => {
    expect(consentProofKindSchema.parse('CGU_ACCEPTANCE')).toBe('CGU_ACCEPTANCE');
    expect(consentProofKindSchema.parse('WITHDRAWAL_WAIVER_IMMEDIATE')).toBe('WITHDRAWAL_WAIVER_IMMEDIATE');
    expect(consentProofKindSchema.parse('WITHDRAWAL_WAIVER_WAIT_14_DAYS')).toBe('WITHDRAWAL_WAIVER_WAIT_14_DAYS');
    expect(() => consentProofKindSchema.parse('INVALID_KIND')).toThrow();
  });

  it('computes deterministic SHA-256 checksum and verifies integrity', () => {
    const payload = {
      userId: 'usr_test_123',
      kind: 'CGU_ACCEPTANCE' as const,
      timestamp: '2026-10-11T03:00:00.000Z',
      actionProof: 'CHECKBOX_TICKED_AND_REGISTRATION_SUBMITTED',
      legalTextSnapshot: CANONICAL_CGU_ACCEPTANCE_TEXT,
      cguVersion: CURRENT_CGU_VERSION,
    };

    const checksum = computeConsentChecksum(payload);
    expect(typeof checksum).toBe('string');
    expect(checksum).toHaveLength(64);

    // Verify valid proof
    const proof = {
      id: 'proof_123',
      ...payload,
      timestamp: new Date(payload.timestamp),
      commandeId: null,
      waiverTextVersion: null,
      ipAddress: '127.0.0.1',
      userAgent: 'Revime/1.0.0 iOS',
      checksum,
      metadata: null,
    };

    const parsedProof = consentProofSchema.parse(proof);
    expect(parsedProof.id).toBe('proof_123');

    const verification = verifyConsentProofChecksum(proof);
    expect(verification.valid).toBe(true);

    // Tampered payload fails verification
    const tamperedProof = {
      ...proof,
      actionProof: 'TAMPERED_ACTION',
    };
    const tamperedVerification = verifyConsentProofChecksum(tamperedProof);
    expect(tamperedVerification.valid).toBe(false);
  });

  it('validates create consent proof input schema', () => {
    const input = {
      userId: 'usr_456',
      kind: 'WITHDRAWAL_WAIVER_IMMEDIATE' as const,
      waiverTextVersion: CURRENT_WITHDRAWAL_WAIVER_VERSION,
      legalTextSnapshot: 'Waiver text',
      actionProof: 'CHECKBOX_TICKED_AND_CHECKOUT_SUBMITTED',
      commandeId: 'cmd_789',
    };

    const parsed = createConsentProofInputSchema.parse(input);
    expect(parsed.userId).toBe('usr_456');
    expect(parsed.commandeId).toBe('cmd_789');
  });

  it('re-exports compliance schemas and constants from index', async () => {
    const index = await import('../src/index.js');
    expect(index.CURRENT_CGU_VERSION).toBe(CURRENT_CGU_VERSION);
    expect(index.CURRENT_WITHDRAWAL_WAIVER_VERSION).toBe(CURRENT_WITHDRAWAL_WAIVER_VERSION);
    expect(index.CANONICAL_CGU_ACCEPTANCE_TEXT).toBe(CANONICAL_CGU_ACCEPTANCE_TEXT);
    expect(index.consentProofKindSchema).toBe(consentProofKindSchema);
    expect(index.createConsentProofInputSchema).toBe(createConsentProofInputSchema);
    expect(index.consentProofSchema).toBe(consentProofSchema);
    expect(index.computeConsentChecksum).toBe(computeConsentChecksum);
    expect(index.verifyConsentProofChecksum).toBe(verifyConsentProofChecksum);
  });
});

describe('CF6-19 Compliance Shared Contracts', () => {
  it('includes compliance.read in ADMIN_PERMISSIONS and grants to super_admin and admin only', () => {
    expect(ADMIN_PERMISSIONS).toContain('compliance.read');
    expect(ROLE_PERMISSIONS.super_admin).toContain('compliance.read');
    expect(ROLE_PERMISSIONS.admin).toContain('compliance.read');
    expect(ROLE_PERMISSIONS.moderation).not.toContain('compliance.read');
    expect(ROLE_PERMISSIONS.support).not.toContain('compliance.read');
    expect(ROLE_PERMISSIONS.finance).not.toContain('compliance.read');
    expect(ROLE_PERMISSIONS.read_only).not.toContain('compliance.read');
  });

  it('includes compliance.proof_verify in adminAuditActionSchema and ADMIN_AUDIT_ACTION_LABEL', () => {
    expect(adminAuditActionSchema.safeParse('compliance.proof_verify').success).toBe(true);
    expect(ADMIN_AUDIT_ACTION_LABEL['compliance.proof_verify']).toBeDefined();
  });

  it('parses and defaults adminComplianceListQuerySchema', () => {
    const parsed = adminComplianceListQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.page).toBe(1);

    const withFilters = adminComplianceListQuerySchema.parse({
      q: '  test@revime.fr  ',
      kind: 'CGU_ACCEPTANCE',
      limit: '50',
      page: '2',
    });
    expect(withFilters.q).toBe('test@revime.fr');
    expect(withFilters.kind).toBe('CGU_ACCEPTANCE');
    expect(withFilters.limit).toBe(50);
    expect(withFilters.page).toBe(2);
  });

  it('validates adminComplianceItemSchema and verify response', () => {
    const item = {
      id: 'c0000000-0000-4000-8000-000000000001',
      userId: 'usr_123',
      userEmail: 'user@example.com',
      kind: 'CGU_ACCEPTANCE',
      cguVersion: '2026-09-04',
      waiverTextVersion: null,
      legalTextSnapshot: 'Texte CGU',
      actionProof: 'CHECKBOX_CLICK',
      commandeId: null,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      timestamp: '2026-10-11T04:30:00.000Z',
      valid: true,
      historicalImport: false,
    };
    expect(adminComplianceItemSchema.safeParse(item).success).toBe(true);

    const listRes = {
      items: [item],
      total: 1,
      page: 1,
      totalPages: 1,
    };
    expect(adminComplianceListResponseSchema.safeParse(listRes).success).toBe(true);

    const verifyRes = {
      id: item.id,
      valid: true,
      historicalImport: false,
      calculatedChecksum: item.checksum,
      storedChecksum: item.checksum,
      verifiedAt: '2026-10-11T04:30:00.000Z',
    };
    expect(adminComplianceVerifyResponseSchema.safeParse(verifyRes).success).toBe(true);
  });

  it('reads the backfill scheme sha256(id) as valid-and-historical only for HISTORICAL_IMPORT rows', () => {
    const userId = 'usr_legacy';
    const legacy = legacyImportChecksum({ kind: 'CGU_ACCEPTANCE', userId });
    const row = {
      userId,
      kind: 'CGU_ACCEPTANCE' as const,
      timestamp: new Date('2026-09-01T00:00:00.000Z'),
      legalTextSnapshot: 'x',
      checksum: legacy,
    };
    expect(verifyConsentProofChecksum({ ...row, actionProof: 'HISTORICAL_IMPORT_REGISTRATION' })).toMatchObject({
      valid: true,
      historicalImport: true,
    });
    // The same checksum on a live row is not an import: it cannot borrow the legacy scheme.
    expect(verifyConsentProofChecksum({ ...row, actionProof: 'CHECKBOX_CLICK' })).toMatchObject({
      valid: false,
      historicalImport: false,
    });
    // A waiver import is keyed on the commande id.
    expect(legacyImportChecksum({ kind: 'WITHDRAWAL_WAIVER_IMMEDIATE', userId, commandeId: 'cmd_1' })).not.toBe(legacy);
  });

  it('bounds the search term and the page number', () => {
    expect(adminComplianceListQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(adminComplianceListQuerySchema.safeParse({ page: 100_001 }).success).toBe(false);
  });
});
