import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { CANONICAL_CGU_ACCEPTANCE_TEXT, CGU_REACCEPT_REQUIRED_TEXT } from '@revime/shared';
import { AppException } from '../src/common/app-exception.js';
import { FakeStorageGateway } from '../src/storage/gateway.js';
import { LEGAL_DOCUMENT_BUCKET, LegalDocumentsService, activeCguVersion } from '../src/legal/legal-documents.service.js';
import { LegalDocumentsController } from '../src/legal/legal-documents.controller.js';
import { AdminLegalDocumentsController } from '../src/admin/admin-legal-documents.controller.js';
import { AdminSettingsService } from '../src/admin/admin-settings.service.js';
import { PlatformGatesGuard } from '../src/platform/platform-gates.guard.js';
import { PlatformStatusService } from '../src/platform/platform-status.service.js';
import { ALLOW_BEFORE_CGU_ACCEPTANCE } from '../src/platform/allow-before-cgu-acceptance.decorator.js';
import { SKIP_PLATFORM_GATES } from '../src/platform/skip-platform-gates.decorator.js';
import { UsersController } from '../src/users/users.controller.js';
import { SecurityController } from '../src/security/security.controller.js';
import { recordUserCguConsentProof } from '../src/auth/auth.js';

/**
 * V7 D5 (U9b, `DEC7-24` / `DEC7-25`). Published CGU and mentions légales versions (one PDF each in
 * the private `legal-documents` bucket), the dashboard's publish and its dropdowns, a public read
 * route, and the forced re-acceptance: a status field for the app, an acceptance route that writes a
 * consent proof, and the guard's `403 CGU_REACCEPT_REQUIRED` behind `PLATFORM_GATES_ENFORCED`.
 */

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function row(kind: 'CGU' | 'MENTIONS_LEGALES', version: string, extra: Record<string, unknown> = {}) {
  return {
    id: `${kind}-${version}`,
    kind,
    version,
    storagePath: `${kind === 'CGU' ? 'cgu' : 'mentions-legales'}/${version}.pdf`,
    fileName: 'x.pdf',
    sizeBytes: 10,
    sha256: 'abc',
    summary: null,
    publishedAt: new Date('2026-10-30T10:00:00.000Z'),
    publishedByUserId: null,
    ...extra,
  };
}

function prismaMock(opts: { rows?: ReturnType<typeof row>[]; settings?: Record<string, unknown> | null } = {}) {
  const rows = opts.rows ?? [];
  const settings = opts.settings === undefined ? { cguCurrentVersion: '2026-10-10', legalNoticeVersion: '2026-10-10', cguForceReaccept: false } : opts.settings;
  return {
    legalDocumentVersion: {
      findMany: vi.fn(async () => [...rows].sort((a, b) => b.version.localeCompare(a.version))),
      findUnique: vi.fn(async ({ where }: { where: { kind_version: { kind: string; version: string } } }) =>
        rows.find((r) => r.kind === where.kind_version.kind && r.version === where.kind_version.version) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', publishedAt: new Date('2026-11-15T09:00:00.000Z'), ...data })),
    },
    platformSettings: {
      findUnique: vi.fn(async () => settings),
      upsert: vi.fn(async () => ({})),
    },
    user: { update: vi.fn(async () => ({})) },
    consentProof: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
  };
}

function service(prisma = prismaMock(), storage = new FakeStorageGateway()) {
  return { s: new LegalDocumentsService(prisma as never, storage), prisma, storage };
}

afterEach(() => {
  delete process.env.PLATFORM_GATES_ENFORCED;
});

describe('the registry', () => {
  it('lists both documents, newest first, as DTOs', async () => {
    const t = service(prismaMock({ rows: [row('CGU', '2026-10-10'), row('CGU', '2026-11-15'), row('MENTIONS_LEGALES', '2026-10-10')] }));
    const out = await t.s.list();
    expect(out.cgu.map((v) => v.version)).toEqual(['2026-11-15', '2026-10-10']);
    expect(out.mentionsLegales.map((v) => v.version)).toEqual(['2026-10-10']);
    expect(out.cgu[0]!.publishedAt).toBe('2026-10-30T10:00:00.000Z');
  });

  it('signs an upload at <slug>/<version>.pdf in the legal-documents bucket, as a PDF', async () => {
    const storage = new FakeStorageGateway();
    const spy = vi.spyOn(storage, 'createSignedUpload');
    const t = service(prismaMock(), storage);
    const out = await t.s.signUpload({ kind: 'MENTIONS_LEGALES', version: '2026-11-15' });
    expect(out.path).toBe('mentions-legales/2026-11-15.pdf');
    expect(spy).toHaveBeenCalledWith('mentions-legales/2026-11-15.pdf', 'application/pdf', LEGAL_DOCUMENT_BUCKET);
    expect(LEGAL_DOCUMENT_BUCKET).toBe('legal-documents');
  });

  it('refuses to sign or publish a version that already exists: published versions are never replaced (Q14)', async () => {
    const t = service(prismaMock({ rows: [row('CGU', '2026-10-10')] }));
    await expect(t.s.signUpload({ kind: 'CGU', version: '2026-10-10' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      t.s.publish({ kind: 'CGU', version: '2026-10-10', path: 'cgu/2026-10-10.pdf', activate: false }, 'admin-1'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('publishing', () => {
  const input = { kind: 'CGU' as const, version: '2026-11-15', path: 'cgu/2026-11-15.pdf', summary: 'Article 12 précisé.', activate: true };

  it('reads the uploaded PDF, records its size and SHA-256, and activates it when asked', async () => {
    const t = service();
    await t.storage.putObject(LEGAL_DOCUMENT_BUCKET, input.path, PDF, 'application/pdf');
    const out = await t.s.publish(input, 'admin-1');
    expect(t.prisma.legalDocumentVersion.create).toHaveBeenCalledWith({
      data: {
        kind: 'CGU',
        version: '2026-11-15',
        storagePath: 'cgu/2026-11-15.pdf',
        fileName: 'cgu-2026-11-15.pdf',
        sizeBytes: PDF.length,
        sha256: sha(PDF),
        summary: 'Article 12 précisé.',
        publishedByUserId: 'admin-1',
      },
    });
    expect(t.prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { cguCurrentVersion: '2026-11-15', updatedByUserId: 'admin-1' } }),
    );
    expect(out.version).toBe('2026-11-15');
  });

  it('activates a mentions légales version on its own field, and nothing when not asked', async () => {
    const t = service();
    await t.storage.putObject(LEGAL_DOCUMENT_BUCKET, 'mentions-legales/2026-11-15.pdf', PDF, 'application/pdf');
    await t.s.publish({ kind: 'MENTIONS_LEGALES', version: '2026-11-15', path: 'mentions-legales/2026-11-15.pdf', activate: true }, 'a');
    expect(t.prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { legalNoticeVersion: '2026-11-15', updatedByUserId: 'a' } }),
    );
    const u = service();
    await u.storage.putObject(LEGAL_DOCUMENT_BUCKET, input.path, PDF, 'application/pdf');
    await u.s.publish({ ...input, activate: false }, 'a');
    expect(u.prisma.platformSettings.upsert).not.toHaveBeenCalled();
  });

  it('refuses a file that never arrived, or that is not a PDF, before writing anything', async () => {
    const missing = service();
    await expect(missing.s.publish(input, 'a')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    const notPdf = service();
    await notPdf.storage.putObject(LEGAL_DOCUMENT_BUCKET, input.path, Buffer.from('PNG....'), 'application/pdf');
    await expect(notPdf.s.publish(input, 'a')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    expect(notPdf.prisma.legalDocumentVersion.create).not.toHaveBeenCalled();
  });
});

describe('reading a version (public)', () => {
  it('answers a one-hour signed URL for a published version, 404 otherwise', async () => {
    const storage = new FakeStorageGateway();
    const spy = vi.spyOn(storage, 'createSignedReadUrls');
    const t = service(prismaMock({ rows: [row('CGU', '2026-10-10')] }), storage);
    await storage.putObject(LEGAL_DOCUMENT_BUCKET, 'cgu/2026-10-10.pdf', PDF, 'application/pdf');
    const url = await t.s.readUrl('cgu', '2026-10-10');
    expect(typeof url).toBe('string');
    expect(spy).toHaveBeenCalledWith(['cgu/2026-10-10.pdf'], 3600, LEGAL_DOCUMENT_BUCKET);
    await expect(t.s.readUrl('cgu', '2027-01-01')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(t.s.readUrl('autre', '2026-10-10')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('accepting the CGU again', () => {
  const headers = { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Revime/1.0', 'x-forwarded-for': '6.6.6.6' };

  it('refuses a version that is no longer the active one', async () => {
    const t = service(prismaMock({ rows: [row('CGU', '2026-10-10')] }));
    await expect(t.s.acceptCgu('u1', 'ana@example.com', '2026-09-04', headers)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(t.prisma.user.update).not.toHaveBeenCalled();
  });

  it('stamps the user and writes a CGU_ACCEPTANCE proof naming the version and the PDF hash', async () => {
    const t = service(prismaMock({ rows: [row('CGU', '2026-10-10', { sha256: 'pdfhash' })] }));
    await t.s.acceptCgu('u1', 'ana@example.com', '2026-10-10', headers);
    expect(t.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { cguAccepted: true, cguAcceptedAt: expect.any(Date), cguVersion: '2026-10-10' },
    });
    const proof = t.prisma.consentProof.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(proof).toMatchObject({
      userId: 'u1',
      kind: 'CGU_ACCEPTANCE',
      cguVersion: '2026-10-10',
      legalTextSnapshot: CANONICAL_CGU_ACCEPTANCE_TEXT,
      actionProof: 'REACCEPTANCE_CHECKBOX_TICKED',
      ipAddress: '203.0.113.9',
      userAgent: 'Revime/1.0',
    });
    expect(proof.metadata).toEqual({ email: 'ana@example.com', pdfSha256: 'pdfhash', source: 'reacceptance' });
  });

  it('the active version helper reads the settings, and the default without a row', async () => {
    await expect(activeCguVersion(prismaMock({ settings: { cguCurrentVersion: '2026-11-15' } }) as never)).resolves.toBe('2026-11-15');
    await expect(activeCguVersion(prismaMock({ settings: null }) as never)).resolves.toBe('2026-10-10');
  });
});

describe('the dashboard dropdowns', () => {
  it('refuse an active version that is not published (one source, FND7-027)', async () => {
    const prisma = prismaMock({ rows: [row('CGU', '2026-10-10')] });
    const settings = new AdminSettingsService(prisma as never);
    await expect(settings.updateSettings({ cguCurrentVersion: '2026-12-01' }, 'a')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    await expect(settings.updateSettings({ legalNoticeVersion: '2026-12-01' }, 'a')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    expect(prisma.platformSettings.upsert).not.toHaveBeenCalled();
  });
});

describe('the status read', () => {
  it('carries the active CGU version, the force flag, its summary and date, and the mentions version', async () => {
    const prisma = prismaMock({
      rows: [row('CGU', '2026-11-15', { summary: 'Article 12 précisé.' })],
      settings: { maintenanceEnabled: false, maintenanceMessage: 'm', cguCurrentVersion: '2026-11-15', cguForceReaccept: true, legalNoticeVersion: '2026-10-10' },
    });
    const s = new PlatformStatusService(prisma as never);
    await expect(s.read()).resolves.toEqual({
      maintenance: { enabled: false, message: 'm' },
      cgu: { version: '2026-11-15', forceReaccept: true, summary: 'Article 12 précisé.', publishedAt: '2026-10-30T10:00:00.000Z' },
      legalNotice: { version: '2026-10-10' },
    });
  });
});

describe('the re-acceptance gate', () => {
  function gate(forceReaccept: boolean, maintenance = false) {
    const status = {
      read: vi.fn(async () => ({
        maintenance: { enabled: maintenance, message: 'm' },
        cgu: { version: '2026-11-15', forceReaccept, summary: null, publishedAt: null },
        legalNotice: { version: '2026-10-10' },
      })),
    };
    return new PlatformGatesGuard(new Reflector(), status as never, vi.fn(async () => null) as never);
  }
  function ctx(session: unknown, opts: { path?: string; allow?: boolean } = {}) {
    const handler = function handler() {};
    if (opts.allow) Reflect.defineMetadata(ALLOW_BEFORE_CGU_ACCEPTANCE, true, handler);
    const req = { headers: {}, session, originalUrl: opts.path ?? '/api/v1/demandes' };
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class C {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as never;
  }
  const user = (cguVersion: string | null, role: string | null = null) => ({ user: { id: 'u', role, cguVersion } });

  it('refuses a user not on the active version with 403 CGU_REACCEPT_REQUIRED, once the switch is on', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    const refusal = await gate(true).canActivate(ctx(user('2026-10-10'))).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(AppException);
    expect((refusal as AppException).code).toBe('CGU_REACCEPT_REQUIRED');
    expect((refusal as AppException).getStatus()).toBe(403);
    expect((refusal as AppException).message).toBe(CGU_REACCEPT_REQUIRED_TEXT);
  });

  it('refuses staff too on app routes (Q13), but never on the dashboard’s', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    await expect(gate(true).canActivate(ctx(user(null, 'super_admin')))).rejects.toMatchObject({ code: 'CGU_REACCEPT_REQUIRED' });
    await expect(gate(true).canActivate(ctx(user(null, 'super_admin'), { path: '/api/v1/admin/users' }))).resolves.toBe(true);
  });

  it('lets through a user on the active version, a signed-out visitor, the allowed routes, and everyone when unticked', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    await expect(gate(true).canActivate(ctx(user('2026-11-15')))).resolves.toBe(true);
    await expect(gate(true).canActivate(ctx(null))).resolves.toBe(true);
    await expect(gate(true).canActivate(ctx(user(null), { allow: true }))).resolves.toBe(true);
    await expect(gate(false).canActivate(ctx(user(null)))).resolves.toBe(true);
  });

  it('refuses nothing until the switch is on (Q10)', async () => {
    await expect(gate(true).canActivate(ctx(user(null)))).resolves.toBe(true);
  });

  it('answers maintenance first while both apply to a non-staff user', async () => {
    process.env.PLATFORM_GATES_ENFORCED = 'true';
    await expect(gate(true, true).canActivate(ctx(user(null)))).rejects.toMatchObject({ code: 'MAINTENANCE' });
  });
});

describe('routes', () => {
  const meta = (key: string, target: object) => Reflect.getMetadata(key, target);

  it('the public read route is anonymous, never gated, and redirects', () => {
    expect(meta('path', LegalDocumentsController)).toBe('/');
    expect(meta('path', LegalDocumentsController.prototype.read)).toBe('legal-documents/:kind/:version');
    expect(meta('PUBLIC', LegalDocumentsController.prototype.read)).toBe(true);
    expect(meta(SKIP_PLATFORM_GATES, LegalDocumentsController.prototype.read)).toBe(true);
  });

  it('the acceptance route, /users/me, account deletion and the step-up routes are allowed before accepting (Q11)', () => {
    expect(meta('path', LegalDocumentsController.prototype.accept)).toBe('users/me/cgu-acceptance');
    for (const handler of [
      LegalDocumentsController.prototype.accept,
      UsersController.prototype.me,
      UsersController.prototype.deleteAccount,
      SecurityController.prototype.method,
      SecurityController.prototype.withPassword,
      SecurityController.prototype.sendCode,
      SecurityController.prototype.withCode,
    ]) {
      expect(meta(ALLOW_BEFORE_CGU_ACCEPTANCE, handler), handler.name).toBe(true);
    }
  });

  it('the dashboard routes: list for readers, upload and publish for super admins, publish audited', () => {
    expect(meta('path', AdminLegalDocumentsController)).toBe('admin/legal-documents');
    const src = readFileSync(join(__dirname, '../src/admin/admin-legal-documents.controller.ts'), 'utf8');
    expect(src).toMatch(/@Get\(\)\s*@RequirePermission\('dashboard\.read'\)/);
    expect(src).toMatch(/@Post\('upload-url'\)\s*@RequirePermission\('admin\.manage'\)/);
    expect(src).toMatch(/@Post\(\)\s*@RequirePermission\('admin\.manage'\)\s*@Audit\('legal_document\.publish'/);
  });
});

describe('sign-up records the active version', () => {
  it('the consent proof names the version stamped on the user', async () => {
    const prisma = { consentProof: { create: vi.fn(async ({ data }: { data: unknown }) => data) } };
    await recordUserCguConsentProof(prisma as never, { id: 'u', email: 'a@b.fr', cguAccepted: true, cguVersion: '2026-11-15' }, undefined);
    expect((prisma.consentProof.create.mock.calls[0]![0] as { data: { cguVersion: string } }).data.cguVersion).toBe('2026-11-15');
  });

  it('the sign-up hook stamps the active version, not the compiled constant', () => {
    const src = readFileSync(join(__dirname, '../src/auth/auth.ts'), 'utf8');
    // V9 B1 (2026-11-19): the stamp moved into `signupConsentFields` (`auth/signup-consent.ts`); the hook
    // hands it the dashboard's active version through this resolver. Was `cguVersion = await activeCguVersion(prisma)`.
    expect(src).toMatch(/cgu: \(\) => activeCguVersion\(prisma\)/);
  });
});

describe('/users/me', () => {
  it('carries the accepted CGU version', () => {
    const src = readFileSync(join(__dirname, '../src/users/users.service.ts'), 'utf8');
    expect(src).toMatch(/cguVersion: user\.cguVersion \?\? null/);
  });
});
