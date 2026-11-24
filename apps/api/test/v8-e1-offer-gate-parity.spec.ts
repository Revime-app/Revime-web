import { describe, expect, it, vi } from 'vitest';
import { offerBlock } from '@revime/shared';
import { assertIdentityVerified } from '../src/verification/gate.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * V8 E1, `ISS8-003`. The app's offer sheet opens from `offerBlock`; the server refuses with
 * `assertIdentityVerified`. They must agree on every row, or a repairer meets a block with no way out (the app
 * lets him through and the server refuses) or a block the server would not make (the app stops him for nothing).
 * The BASIC half is `assertBasicVerified`, a separate gate; levels below BASIC are left out here.
 */
const LEVELS = ['BASIC', 'IDENTITY', 'BUSINESS'] as const;
const KINDS = ['INDIVIDUAL', 'PRO'] as const;
const BUSINESS = [null, 'PENDING', 'APPROVED', 'REJECTED', 'DOCUMENTS_REQUIRED'] as const;

function prismaFor(level: string, kind: string, businessStatus: string | null) {
  return {
    profile: { findFirst: vi.fn().mockResolvedValue({ verificationLevel: level }) },
    repairerProfile: { findUnique: vi.fn().mockResolvedValue({ kind }) },
    businessVerification: {
      findUnique: vi.fn().mockResolvedValue(businessStatus ? { status: businessStatus } : null),
    },
  } as unknown as PrismaService;
}

describe('V8 E1 offer gate parity: app offerBlock ⇔ server assertIdentityVerified', () => {
  for (const level of LEVELS) {
    for (const kind of KINDS) {
      for (const businessStatus of BUSINESS) {
        it(`${level} ${kind} business=${businessStatus ?? 'none'}`, async () => {
          const block = offerBlock({
            level,
            kind,
            identityStatus: null,
            lastErrorCode: null,
            identityDecision: null,
            businessStatus,
            basicRequired: false,
            identityRequired: true,
          });
          let refused = false;
          try {
            await assertIdentityVerified(prismaFor(level, kind, businessStatus), 'user-1', 'offer');
          } catch {
            refused = true;
          }
          expect(block !== null).toBe(refused);
        });
      }
    }
  }
});
