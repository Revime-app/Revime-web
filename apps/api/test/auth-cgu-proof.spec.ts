import { describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_CGU_ACCEPTANCE_TEXT,
  CURRENT_CGU_VERSION,
  verifyConsentProofChecksum,
} from '@revime/shared';
import { auth, recordUserCguConsentProof } from '../src/auth/auth.js';

describe('Better Auth CGU proof integration', () => {
  it('specifies the canonical CGU acceptance copy and version', () => {
    expect(CURRENT_CGU_VERSION).toBe('2026-10-10');
    expect(CANONICAL_CGU_ACCEPTANCE_TEXT).toBeDefined();
    expect(CANONICAL_CGU_ACCEPTANCE_TEXT).toContain("Conditions Générales d'Utilisation");
  });

  it('registers user.create.after database hook', () => {
    const hook = auth.options.databaseHooks?.user?.create?.after;
    expect(hook).toBeDefined();
    expect(typeof hook).toBe('function');
  });

  it('records a CGU_ACCEPTANCE consent proof with plain object headers, prioritizing cf-connecting-ip', async () => {
    let createdData: any = null;
    const mockPrisma = {
      consentProof: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdData = data;
          return { id: 'proof-abc', ...data };
        }),
      },
    };

    const user = {
      id: 'user-cgu-123',
      email: 'cgu-test@example.com',
      cguAccepted: true,
      cguAcceptedAt: new Date('2026-10-11T12:00:00Z'),
    };

    const context = {
      context: {
        request: {
          headers: {
            'cf-connecting-ip': '203.0.113.50',
            'x-forwarded-for': '198.51.100.42',
            'user-agent': 'Mozilla/5.0 TestBrowser/1.0',
          },
        },
      },
    };

    await recordUserCguConsentProof(mockPrisma as never, user, context);

    expect(mockPrisma.consentProof.create).toHaveBeenCalledTimes(1);
    expect(createdData).toBeDefined();
    expect(createdData.userId).toBe('user-cgu-123');
    expect(createdData.kind).toBe('CGU_ACCEPTANCE');
    expect(createdData.cguVersion).toBe(CURRENT_CGU_VERSION);
    expect(createdData.legalTextSnapshot).toBe(CANONICAL_CGU_ACCEPTANCE_TEXT);
    expect(createdData.actionProof).toBe('CHECKBOX_TICKED_AND_REGISTRATION_SUBMITTED');
    expect(createdData.ipAddress).toBe('203.0.113.50');
    expect(createdData.userAgent).toBe('Mozilla/5.0 TestBrowser/1.0');
    expect(createdData.metadata).toEqual({ email: 'cgu-test@example.com' });
    expect(createdData.timestamp).toEqual(user.cguAcceptedAt);

    // Verify cryptographic integrity of recorded checksum
    const verification = verifyConsentProofChecksum(createdData);
    expect(verification.valid).toBe(true);
  });

  it('extracts IP and userAgent from standard Fetch API Headers instance, prioritizing cf-connecting-ip', async () => {
    let createdData: any = null;
    const mockPrisma = {
      consentProof: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdData = data;
          return { id: 'proof-fetch-headers', ...data };
        }),
      },
    };

    const user = {
      id: 'user-fetch-headers',
      email: 'fetch-headers@example.com',
      cguAccepted: true,
      cguAcceptedAt: new Date('2026-10-11T13:00:00Z'),
    };

    const fetchHeaders = new Headers({
      'cf-connecting-ip': '203.0.113.195',
      'x-forwarded-for': '198.51.100.42',
      'user-agent': 'Mozilla/5.0 FetchClient/2.0',
    });

    const context = {
      request: {
        headers: fetchHeaders,
      },
    };

    await recordUserCguConsentProof(mockPrisma as never, user, context);

    expect(mockPrisma.consentProof.create).toHaveBeenCalledTimes(1);
    expect(createdData.ipAddress).toBe('203.0.113.195');
    expect(createdData.userAgent).toBe('Mozilla/5.0 FetchClient/2.0');
    expect(verifyConsentProofChecksum(createdData).valid).toBe(true);
  });

  it('stores NO ip when only the client-controlled x-forwarded-for is present', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'p' });
    const mockPrisma = { consentProof: { create } };
    const user = { id: 'user-xff', email: 'xff@example.com', cguAccepted: true };

    // Render appends to a client-supplied X-Forwarded-For, so its left-most entry is whatever the
    // client typed. Evidence must not be a value the signer controls (see client-ip.ts).
    await recordUserCguConsentProof(mockPrisma as never, user, {
      headers: { 'x-forwarded-for': ['198.51.100.1, 192.0.2.1'], 'user-agent': 'Agent/1' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]![0].data;
    expect(data.ipAddress).toBeNull();
    expect(data.userAgent).toBe('Agent/1');
    expect(verifyConsentProofChecksum(data).valid).toBe(true);
  });

  it('does not record a consent proof when user.cguAccepted is false or omitted', async () => {
    const mockPrisma = {
      consentProof: {
        create: vi.fn(),
      },
    };

    await recordUserCguConsentProof(mockPrisma as never, { id: 'user-1', email: 'a@b.c' });
    await recordUserCguConsentProof(mockPrisma as never, { id: 'user-2', email: 'b@b.c', cguAccepted: false });

    expect(mockPrisma.consentProof.create).not.toHaveBeenCalled();
  });

  it('lets a failing proof write reject, so the sign-up hook (not this function) decides to log it', async () => {
    const mockPrisma = { consentProof: { create: vi.fn().mockRejectedValue(new Error('db down')) } };
    await expect(
      recordUserCguConsentProof(mockPrisma as never, { id: 'u', email: 'e@x.y', cguAccepted: true }),
    ).rejects.toThrow('db down');
  });
});
