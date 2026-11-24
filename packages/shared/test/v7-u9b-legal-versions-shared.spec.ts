import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  CGU_REACCEPT_REQUIRED_TEXT,
  DEFAULT_PLATFORM_SETTINGS,
  REACCEPT_CHECKBOX_LABEL,
  REACCEPT_TITLE,
  cguReacceptRequired,
  formatLegalVersionDate,
  legalDocumentPath,
  legalDocumentSlug,
  platformStatusSchema,
  publishLegalVersionSchema,
  type PlatformStatus,
} from '../src/index.js';

/**
 * V7 D5 (U9b, `DEC7-24` / `DEC7-25`): published CGU and mentions légales versions, one PDF each, and
 * the forced re-acceptance rule shared by the app's screen and the API's refusal.
 */
describe('V7 U9b legal versions, shared', () => {
  const status = (forceReaccept: boolean, version = '2026-11-15'): PlatformStatus => ({
    maintenance: { enabled: false, message: 'x' },
    cgu: { version, forceReaccept, summary: null, publishedAt: '2026-11-15T09:00:00.000Z' },
    legalNotice: { version: '2026-10-10' },
  });

  it('forces re-acceptance only when ticked, for a signed-in user not on the active version (Q7)', () => {
    expect(cguReacceptRequired(status(true), { cguVersion: '2026-10-10' })).toBe(true);
    expect(cguReacceptRequired(status(true), { cguVersion: null })).toBe(true);
    expect(cguReacceptRequired(status(true), { cguVersion: '2026-11-15' })).toBe(false);
    expect(cguReacceptRequired(status(false), { cguVersion: '2026-10-10' })).toBe(false);
  });

  it('never forces a signed-out visitor, nor with an unknown or older status (no cgu block)', () => {
    expect(cguReacceptRequired(status(true), null)).toBe(false);
    expect(cguReacceptRequired(null, { cguVersion: null })).toBe(false);
    expect(cguReacceptRequired({ maintenance: { enabled: false, message: 'x' } }, { cguVersion: null })).toBe(false);
  });

  it('parses a status from an API older than U9b (no cgu, no legalNotice)', () => {
    expect(platformStatusSchema.parse({ maintenance: { enabled: true, message: 'm' } })).toEqual({
      maintenance: { enabled: true, message: 'm' },
    });
    expect(platformStatusSchema.parse(status(true))).toEqual(status(true));
  });

  it('accepts a date version, a PDF path under its own slug, and a summary for the CGU only (Q14)', () => {
    const ok = { kind: 'CGU', version: '2026-11-15', path: 'cgu/2026-11-15.pdf', summary: 'Article 12 précisé.', activate: true };
    expect(publishLegalVersionSchema.safeParse(ok).success).toBe(true);
    expect(publishLegalVersionSchema.safeParse({ ...ok, version: '15/11/2026' }).success).toBe(false);
    expect(publishLegalVersionSchema.safeParse({ ...ok, path: 'mentions-legales/2026-11-15.pdf' }).success).toBe(false);
    expect(publishLegalVersionSchema.safeParse({ ...ok, kind: 'MENTIONS_LEGALES', path: 'mentions-legales/2026-11-15.pdf' }).success).toBe(false);
    expect(
      publishLegalVersionSchema.safeParse({ ...ok, kind: 'MENTIONS_LEGALES', path: 'mentions-legales/2026-11-15.pdf', summary: null }).success,
    ).toBe(true);
  });

  it('names the storage path, the public read path and the French date', () => {
    expect(legalDocumentSlug('CGU')).toBe('cgu');
    expect(legalDocumentSlug('MENTIONS_LEGALES')).toBe('mentions-legales');
    expect(legalDocumentPath('MENTIONS_LEGALES', '2026-10-10')).toBe('/legal-documents/mentions-legales/2026-10-10');
    expect(formatLegalVersionDate('2026-10-10')).toBe('10/10/2026');
  });

  it('carries the agreed wording, the error code, and 2026-10-10 as the default version', () => {
    expect(REACCEPT_TITLE).toBe("Nos conditions d'utilisation évoluent");
    expect(REACCEPT_CHECKBOX_LABEL).toBe("J'ai lu et j'accepte les Conditions Générales d'Utilisation");
    expect(CGU_REACCEPT_REQUIRED_TEXT).toBe("Acceptez les nouvelles Conditions Générales d'Utilisation pour continuer.");
    expect(API_ERROR_CODES).toContain('CGU_REACCEPT_REQUIRED');
    expect(DEFAULT_PLATFORM_SETTINGS.cguCurrentVersion).toBe('2026-10-10');
    expect(DEFAULT_PLATFORM_SETTINGS.legalNoticeVersion).toBe('2026-10-10');
  });
});
