import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CANONICAL_PRIVACY_ACCEPTANCE_TEXT, verifyConsentProofChecksum } from '@revime/shared';
import { UsersService } from '../src/users/users.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { LegalDocumentsService } from '../src/legal/legal-documents.service.js';
import { LegalDocumentsController } from '../src/legal/legal-documents.controller.js';
import { ALLOW_BEFORE_CGU_ACCEPTANCE } from '../src/platform/allow-before-cgu-acceptance.decorator.js';
import { FakeStorageGateway } from '../src/storage/gateway.js';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04`…`06`, `FND9-017`). The routes the completion steps call,
 * reachable while a forced re-acceptance is pending (it is ON in production), and what they record.
 */
const meta = (key: string, target: object) => Reflect.getMetadata(key, target);

describe('the username step', () => {
  const setup = (taken: boolean) => {
    const prisma = {
      user: {
        findFirst: vi.fn(async () => (taken ? { id: 'someone-else' } : null)),
        update: vi.fn(async (_args: unknown) => ({})),
      },
    };
    const s = new UsersService(prisma as never, {} as never);
    vi.spyOn(s, 'me').mockResolvedValue({ id: 'u1' } as never);
    return { s, prisma };
  };

  it('keeps the generated handle without a conflict with himself, and confirms it (Review Focus 4)', async () => {
    const t = setup(false);
    await t.s.updateUsername('u1', { username: 'oorvandel' });
    expect(t.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { username: 'oorvandel', id: { not: 'u1' } },
      select: { id: true },
    });
    const data = (t.prisma.user.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.username).toBe('oorvandel');
    expect(data.usernameConfirmedAt).toBeInstanceOf(Date);
  });

  it('answers a taken handle with the existing 409 and confirms nothing', async () => {
    const t = setup(true);
    await expect(t.s.updateUsername('u1', { username: 'pris' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: "Ce nom d'utilisateur est déjà pris.",
    });
    expect(t.prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('routes reachable before any acceptance (Review Focus 2)', () => {
  it('opens the username, role and new acceptance routes', () => {
    expect(meta('path', LegalDocumentsController.prototype.acceptSignupTerms)).toBe('users/me/signup-acceptance');
    for (const handler of [
      UsersController.prototype.updateUsername,
      UsersController.prototype.updateModes,
      LegalDocumentsController.prototype.acceptSignupTerms,
    ]) {
      expect(meta(ALLOW_BEFORE_CGU_ACCEPTANCE, handler), handler.name).toBe(true);
    }
  });
});

describe('acceptSignupTerms', () => {
  const setup = (opts: { cgu?: string; privacy?: string; method?: string | null } = {}) => {
    const proofs: Array<Record<string, unknown>> = [];
    const userUpdates: Array<Record<string, unknown>> = [];
    const tx = {
      user: { update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (userUpdates.push(data), {})) },
      consentProof: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (proofs.push(data), data)) },
    };
    const prisma = {
      ...tx,
      platformSettings: {
        findUnique: vi.fn(async () => ({
          cguCurrentVersion: opts.cgu ?? '2026-10-10',
          privacyCurrentVersion: opts.privacy ?? '2026-11-19',
        })),
      },
      legalDocumentVersion: { findUnique: vi.fn(async () => ({ sha256: 'abc' })) },
      user: {
        ...tx.user,
        findUnique: vi.fn(async () => ({ signupMethod: opts.method === undefined ? 'GOOGLE' : opts.method })),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { s: new LegalDocumentsService(prisma as never, new FakeStorageGateway()), prisma, proofs, userUpdates };
  };
  const headers = { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'UA/1' };

  it('stamps both acceptances and seals two proofs naming the sign-up method', async () => {
    const t = setup();
    await t.s.acceptSignupTerms('u1', 'a@example.com', '2026-10-10', headers);
    expect(t.userUpdates).toHaveLength(1);
    expect(t.userUpdates[0]).toMatchObject({
      cguAccepted: true,
      cguVersion: '2026-10-10',
      privacyAccepted: true,
      privacyVersion: '2026-11-19',
    });
    expect(t.userUpdates[0]!.cguAcceptedAt).toBeInstanceOf(Date);
    expect(t.userUpdates[0]!.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(t.proofs.map((p) => p.kind)).toEqual(['CGU_ACCEPTANCE', 'PRIVACY_ACCEPTANCE']);
    for (const p of t.proofs) {
      expect(p.actionProof).toBe('SIGNUP_COMPLETION_CHECKBOXES_TICKED');
      expect(p.ipAddress).toBe('203.0.113.9');
      expect((p.metadata as Record<string, unknown>).signupMethod).toBe('GOOGLE');
      expect(verifyConsentProofChecksum(p as never).valid).toBe(true);
    }
    expect(t.proofs[1]).toMatchObject({ privacyVersion: '2026-11-19', legalTextSnapshot: CANONICAL_PRIVACY_ACCEPTANCE_TEXT });
    expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses a stale CGU version and writes nothing', async () => {
    const t = setup();
    await expect(t.s.acceptSignupTerms('u1', 'a@example.com', '2026-09-04', headers)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: "Cette version n'est plus celle en vigueur : rouvrez l'application.",
    });
    expect(t.userUpdates).toHaveLength(0);
    expect(t.proofs).toHaveLength(0);
  });
});

describe('/users/me', () => {
  it('carries the sign-up method, the confirmed username and the privacy version', () => {
    const src = readFileSync(join(__dirname, '../src/users/users.service.ts'), 'utf8');
    expect(src).toMatch(/signupMethod: user\.signupMethod \?\? null/);
    expect(src).toMatch(/usernameConfirmedAt: user\.usernameConfirmedAt\?\.toISOString\(\) \?\? null/);
    expect(src).toMatch(/privacyVersion: user\.privacyVersion \?\? null/);
  });
});
