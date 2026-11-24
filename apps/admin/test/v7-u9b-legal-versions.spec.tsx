import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminLegalVersionsResponse, LegalDocumentVersionDto, PlatformSettingsDto } from '@revime/shared';
import { DEFAULT_PLATFORM_SETTINGS } from '@revime/shared';
import {
  LEGAL_VERSIONS_ENDPOINT,
  legalReadHref,
  publishFormError,
  publishLegalVersion,
  versionOptions,
} from '../lib/legal-versions';
import ReglagesPage, { updatePlatformSettingsAction } from '../app/reglages/page';

vi.mock('../components/AdminGate', () => ({ useAdminMe: () => null }));

/**
 * V7 D5 (U9b, `DEC7-24` Q14). Réglages → CGU & Légal: dropdowns of published versions with their date
 * and « Lire », and « Publier une nouvelle version » (sign an upload, PUT the PDF, publish).
 */

const v = (kind: 'CGU' | 'MENTIONS_LEGALES', version: string, publishedAt = '2026-10-30T10:00:00.000Z'): LegalDocumentVersionDto => ({
  id: `${kind}-${version}`,
  kind,
  version,
  fileName: 'x.pdf',
  sizeBytes: 1,
  sha256: 'h',
  summary: null,
  publishedAt,
  publishedByUserId: null,
});
const versions: AdminLegalVersionsResponse = {
  cgu: [v('CGU', '2026-11-15', '2026-11-15T09:00:00.000Z'), v('CGU', '2026-10-10')],
  mentionsLegales: [v('MENTIONS_LEGALES', '2026-10-10')],
};
const settings: PlatformSettingsDto = { ...DEFAULT_PLATFORM_SETTINGS, updatedAt: '2026-10-30T10:00:00.000Z', updatedByUserId: null };
const pdf = () => new Blob(['%PDF-1.7'], { type: 'application/pdf' });

describe('the helpers', () => {
  it('label each published version with its date and publication day, newest first', () => {
    expect(versionOptions(versions.cgu, '2026-10-10')).toEqual([
      { value: '2026-11-15', label: '15/11/2026 · publiée le 15/11/2026' },
      { value: '2026-10-10', label: '10/10/2026 · publiée le 30/10/2026' },
    ]);
  });

  it('keep a stored value that names no published version visible, marked as such', () => {
    expect(versionOptions([], '2026-09-04')).toEqual([{ value: '2026-09-04', label: '2026-09-04 (non publiée)' }]);
  });

  it('read through the same-origin proxy', () => {
    expect(LEGAL_VERSIONS_ENDPOINT).toBe('/api/proxy/admin/legal-documents');
    expect(legalReadHref('CGU', '2026-10-10')).toBe('/api/proxy/legal-documents/cgu/2026-10-10');
  });

  it('check the form before anything is sent', () => {
    expect(publishFormError({ version: '2026-11-15', file: pdf() })).toBeNull();
    expect(publishFormError({ version: '15/11/2026', file: pdf() })).toBe('La version est une date (AAAA-MM-JJ).');
    expect(publishFormError({ version: '2026-11-15', file: null })).toBe('Choisissez le fichier PDF.');
    expect(publishFormError({ version: '2026-11-15', file: new Blob(['x'], { type: 'image/png' }) })).toBe('Le fichier doit être un PDF.');
  });
});

describe('publishing', () => {
  it('signs, PUTs the PDF, then publishes, and answers the new version', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/upload-url')) return new Response(JSON.stringify({ path: 'cgu/2026-11-15.pdf', uploadUrl: 'https://store/up' }), { status: 200 });
      if (url === 'https://store/up') return new Response('{}', { status: 200 });
      return new Response(JSON.stringify(v('CGU', '2026-11-15')), { status: 201 });
    });
    const file = pdf();
    const out = await publishLegalVersion({ kind: 'CGU', version: '2026-11-15', file, summary: ' Article 12. ', activate: true }, fetchFn as never);
    expect(out).toEqual({ ok: true, version: v('CGU', '2026-11-15') });
    expect(calls.map((c) => [c.url, c.init?.method])).toEqual([
      ['/api/proxy/admin/legal-documents/upload-url', 'POST'],
      ['https://store/up', 'PUT'],
      ['/api/proxy/admin/legal-documents', 'POST'],
    ]);
    expect(calls[1]!.init?.body).toBe(file);
    expect(JSON.parse(String(calls[2]!.init?.body))).toEqual({
      kind: 'CGU', version: '2026-11-15', path: 'cgu/2026-11-15.pdf', summary: 'Article 12.', activate: true,
    });
  });

  it('sends no summary for the mentions légales, and shows the server’s reason on a refusal', async () => {
    const bodies: unknown[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/upload-url')) return new Response(JSON.stringify({ path: 'mentions-legales/2026-11-15.pdf', uploadUrl: 'https://store/up' }), { status: 200 });
      if (url === 'https://store/up') return new Response('{}', { status: 200 });
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'Cette version est déjà publiée.' } }), { status: 409 });
    });
    const out = await publishLegalVersion({ kind: 'MENTIONS_LEGALES', version: '2026-11-15', file: pdf(), summary: 'ignoré', activate: false }, fetchFn as never);
    expect(out).toEqual({ ok: false, error: 'Cette version est déjà publiée.' });
    expect((bodies[0] as { summary: unknown }).summary).toBeNull();
  });

  it('stops when the file upload fails', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/upload-url')) return new Response(JSON.stringify({ path: 'cgu/x.pdf', uploadUrl: 'https://store/up' }), { status: 200 });
      return new Response('nope', { status: 400 });
    });
    const out = await publishLegalVersion({ kind: 'CGU', version: '2026-11-15', file: pdf(), summary: null, activate: false }, fetchFn as never);
    expect(out).toEqual({ ok: false, error: "Le fichier n'a pas pu être envoyé." });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('the settings save shows the server’s reason too (an unpublished version is refused)', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'UNPROCESSABLE_ENTITY', message: "Cette version (2026-12-01) n'est pas publiée." } }), { status: 422 }));
    await expect(updatePlatformSettingsAction({ cguCurrentVersion: '2026-12-01' }, '/x', fetchFn as never)).resolves.toEqual({
      ok: false,
      error: "Cette version (2026-12-01) n'est pas publiée.",
    });
  });
});

describe('the CGU & Légal card', () => {
  it('offers dropdowns of published versions with « Lire », not free text', () => {
    const html = renderToString(<ReglagesPage initialSettings={settings} initialIsSuperAdmin={true} initialLegalVersions={versions} />);
    expect(html).toMatch(/<select[^>]*id="cguCurrentVersion"/);
    expect(html).toMatch(/<select[^>]*id="legalNoticeVersion"/);
    expect(html).not.toMatch(/<input[^>]*id="cguCurrentVersion"/);
    expect(html).toContain('15/11/2026 · publiée le 15/11/2026');
    expect(html).toContain('href="/api/proxy/legal-documents/cgu/2026-10-10"');
    expect(html).toContain('href="/api/proxy/legal-documents/mentions-legales/2026-10-10"');
  });

  it('shows « Publier une nouvelle version » to a super admin only', () => {
    const admin = renderToString(<ReglagesPage initialSettings={settings} initialIsSuperAdmin={true} initialLegalVersions={versions} />);
    expect(admin).toContain('Publier une nouvelle version');
    expect(admin).toContain('accept="application/pdf"');
    const reader = renderToString(<ReglagesPage initialSettings={settings} initialIsSuperAdmin={false} initialLegalVersions={versions} />);
    expect(reader).not.toContain('Publier une nouvelle version');
  });

  it('the « pas encore appliquées » banner no longer names the CGU', () => {
    const html = renderToString(<ReglagesPage initialSettings={settings} initialIsSuperAdmin={true} initialLegalVersions={versions} />);
    const banner = html.match(/Valeurs enregistrées, pas encore appliquées[^<]*/)?.[0] ?? '';
    expect(banner).toContain('les frais, les délais et les transporteurs');
    expect(banner).not.toContain('CGU');
  });
});
