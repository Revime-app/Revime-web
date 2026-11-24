import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_GROUP_BY_TYPE,
  QUOTE_REQUEST_TTL_DAYS,
  browseQuerySchema,
  createQuoteRequestSchema,
  dashboardTodoItemSchema,
  declineQuoteRequestSchema,
  notificationCopy,
  notificationTypeSchema,
  quoteClosedReasonSchema,
  quoteRequestLabel,
  quoteRequestActions,
  quoteRequestHeader,
  quoteRequestTargetLabel,
  repairerQuoteRequestLabel,
  todoCopy,
  type NotificationCopyInput,
  type QuoteRequestInfo,
  type RepairerQuoteRequestItem,
} from '@revime/shared';

/** CF4-H (CF4-24 / CF4-25) - the shared contract. Spec §3, §4.1-§4.3. */

const valid = {
  categoryId: '11111111-1111-4111-8111-111111111111',
  title: 'Écran cassé',
  description: 'Mon écran est fissuré depuis une chute.',
  mode: 'OFFERS' as const,
  locationLabel: 'Lyon',
  postalCode: '69001',
};

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0]!.message;

describe('createQuoteRequestSchema', () => {
  it('accepts the H3 request fields, with preferredTravel and details optional', () => {
    const r = createQuoteRequestSchema.safeParse({ ...valid, preferredTravel: 'HOME', details: 'Dispo le soir.' });
    expect(r.success).toBe(true);
    expect(createQuoteRequestSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects a missing title, description or category', () => {
    for (const key of ['title', 'description', 'categoryId'] as const) {
      const { [key]: _drop, ...rest } = valid;
      expect(createQuoteRequestSchema.safeParse(rest).success, key).toBe(false);
    }
  });
  it('rejects BUDGET mode without a budget', () => {
    const r = createQuoteRequestSchema.safeParse({ ...valid, mode: 'BUDGET' });
    expect(firstMessage(r)).toBe('Indiquez votre budget.');
  });
  it('rejects details over 1000 characters', () => {
    const r = createQuoteRequestSchema.safeParse({ ...valid, details: 'x'.repeat(1001) });
    expect(firstMessage(r)).toBe('Informations trop longues.');
    expect(createQuoteRequestSchema.safeParse({ ...valid, details: 'x'.repeat(1000) }).success).toBe(true);
  });
  it('rejects an unknown travel mode', () => {
    expect(createQuoteRequestSchema.safeParse({ ...valid, preferredTravel: 'MOON' }).success).toBe(false);
  });
});

describe('declineQuoteRequestSchema', () => {
  it('requires a trimmed, non-empty note of at most 300 characters', () => {
    expect(firstMessage(declineQuoteRequestSchema.safeParse({ note: '   ' }))).toBe('Indiquez la raison du refus.');
    expect(firstMessage(declineQuoteRequestSchema.safeParse({ note: 'x'.repeat(301) }))).toBe('Raison trop longue.');
    expect(declineQuoteRequestSchema.parse({ note: '  Trop loin  ' })).toEqual({ note: 'Trop loin' });
  });
});

describe('browseQuerySchema', () => {
  it('accepts q, categoryId and page, all optional', () => {
    expect(browseQuerySchema.parse({})).toEqual({});
    expect(browseQuerySchema.parse({ q: ' vélo ', page: '2' })).toEqual({ q: 'vélo', page: 2 });
  });
  it('uses the feed messages', () => {
    expect(firstMessage(browseQuerySchema.safeParse({ q: 'x'.repeat(121) }))).toBe('Recherche trop longue.');
    expect(firstMessage(browseQuerySchema.safeParse({ categoryId: 'nope' }))).toBe('Catégorie invalide.');
    expect(browseQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('constants and reasons', () => {
  it('7-day TTL and the four close reasons', () => {
    expect(QUOTE_REQUEST_TTL_DAYS).toBe(7);
    expect(quoteClosedReasonSchema.options).toEqual(['DECLINED', 'EXPIRED', 'QUOTE_REFUSED', 'CANCELLED_BY_CLIENT']);
  });
});

describe('quoteRequestLabel (CF6-15 dedicated client statuses)', () => {
  const info = (closedReason: QuoteRequestInfo['closedReason']): QuoteRequestInfo => ({
    repairer: { userId: 'r1', displayName: 'Atelier Martin' },
    preferredTravel: null,
    details: null,
    expiresAt: null,
    closedReason,
    declineNote: null,
  });
  it('OPEN reads « En attente de réponse » then « Devis reçu »', () => {
    expect(quoteRequestLabel(info(null), 'OPEN', false)).toBe('En attente de réponse');
    expect(quoteRequestLabel(info(null), 'OPEN', true)).toBe('Devis reçu');
  });
  it.each([
    ['DECLINED', 'Refusé'],
    ['EXPIRED', 'Annulé'],
    ['QUOTE_REFUSED', 'Refusé'],
    ['CANCELLED_BY_CLIENT', 'Annulé'],
  ] as const)('CANCELLED + %s → %s', (reason, label) => {
    expect(quoteRequestLabel(info(reason), 'CANCELLED', false)).toBe(label);
    expect(quoteRequestLabel(info(reason), 'CANCELLED', true)).toBe(label);
  });
  it('CANCELLED without a reason reads « Annulé »', () => {
    expect(quoteRequestLabel(info(null), 'CANCELLED', false)).toBe('Annulé');
  });
  it('IN_PROGRESS and DONE read « Devis accepté »', () => {
    expect(quoteRequestLabel(info(null), 'IN_PROGRESS', true)).toBe('Devis accepté');
    expect(quoteRequestLabel(info(null), 'DONE', true)).toBe('Devis accepté');
  });
});

describe('quote notifications', () => {
  const copy = (type: NotificationCopyInput['type'], subject: string | null, actorName: string | null = null) =>
    notificationCopy({ type, mode: 'CLIENT', actorName, subject, amountCents: null, step: null, messagePreview: null });

  it('the four types exist and are grouped under offers', () => {
    for (const t of ['QUOTE_REQUESTED', 'QUOTE_DECLINED', 'QUOTE_EXPIRED', 'QUOTE_REFUSED'] as const) {
      expect(notificationTypeSchema.options).toContain(t);
      expect(NOTIFICATION_GROUP_BY_TYPE[t]).toBe('offers');
    }
  });
  it('QUOTE_REQUESTED', () => {
    expect(copy('QUOTE_REQUESTED', 'Écran cassé', 'Julie')).toEqual({
      title: 'Nouvelle demande de devis',
      sub: 'Julie vous demande un devis pour « Écran cassé »',
    });
    expect(copy('QUOTE_REQUESTED', null, null)).toEqual({
      title: 'Nouvelle demande de devis',
      sub: 'Un client vous demande un devis',
    });
  });
  it('QUOTE_DECLINED', () => {
    expect(copy('QUOTE_DECLINED', 'Écran cassé')).toEqual({
      title: 'Demande de devis refusée',
      sub: 'Le réparateur a refusé votre demande pour « Écran cassé »',
    });
    expect(copy('QUOTE_DECLINED', null).sub).toBe('Le réparateur a refusé votre demande');
  });
  it('QUOTE_EXPIRED', () => {
    expect(copy('QUOTE_EXPIRED', 'Écran cassé')).toEqual({
      title: 'Demande de devis expirée',
      sub: 'Aucune réponse sous 7 jours pour « Écran cassé »',
    });
    expect(copy('QUOTE_EXPIRED', null).sub).toBe('Aucune réponse sous 7 jours');
  });
  it('QUOTE_REFUSED', () => {
    expect(copy('QUOTE_REFUSED', 'Écran cassé')).toEqual({
      title: 'Devis refusé',
      sub: 'Le client a refusé votre devis pour « Écran cassé »',
    });
    expect(copy('QUOTE_REFUSED', null).sub).toBe('Le client a refusé votre devis');
  });
});

describe('QUOTE_REQUESTS todo', () => {
  it('parses and pluralises', () => {
    expect(dashboardTodoItemSchema.parse({ kind: 'QUOTE_REQUESTS', count: 3 })).toEqual({ kind: 'QUOTE_REQUESTS', count: 3 });
    expect(dashboardTodoItemSchema.safeParse({ kind: 'QUOTE_REQUESTS', count: 0 }).success).toBe(false);
    expect(todoCopy({ kind: 'QUOTE_REQUESTS', count: 1 }).title).toBe('1 demande de devis en attente de réponse');
    expect(todoCopy({ kind: 'QUOTE_REQUESTS', count: 3 }).title).toBe('3 demandes de devis en attente de réponse');
  });
});

describe('quoteRequestHeader / quoteRequestActions (CF4-25 mobile rules)', () => {
  const info: QuoteRequestInfo = {
    repairer: { userId: 'r1', displayName: 'Atelier Martin' },
    preferredTravel: null,
    details: null,
    expiresAt: null,
    closedReason: null,
    declineNote: null,
  };
  const none = { canCancel: false, canRefuseQuote: false, canViewQuote: false, canSendQuote: false, canDecline: false };

  it('header names the réparateur', () => {
    expect(quoteRequestHeader(info)).toBe('Demande de devis privée · Atelier Martin');
  });

  it('author, OPEN, no quote yet: cancel only', () => {
    expect(quoteRequestActions({ viewer: 'AUTHOR', status: 'OPEN', hasLiveQuote: false })).toEqual({ ...none, canCancel: true });
  });
  it('author, OPEN, quote received: view / refuse / cancel', () => {
    expect(quoteRequestActions({ viewer: 'AUTHOR', status: 'OPEN', hasLiveQuote: true })).toEqual({
      ...none, canCancel: true, canViewQuote: true, canRefuseQuote: true,
    });
  });
  it('target, OPEN, not answered: send or decline', () => {
    expect(quoteRequestActions({ viewer: 'TARGET', status: 'OPEN', hasLiveQuote: false })).toEqual({
      ...none, canSendQuote: true, canDecline: true,
    });
  });
  it('target, OPEN, quote sent: decline only (withdraw lives on his offer)', () => {
    expect(quoteRequestActions({ viewer: 'TARGET', status: 'OPEN', hasLiveQuote: true })).toEqual({ ...none, canDecline: true });
  });
  it.each(['IN_PROGRESS', 'DONE', 'CANCELLED'] as const)('nothing once %s', (status) => {
    expect(quoteRequestActions({ viewer: 'AUTHOR', status, hasLiveQuote: true })).toEqual(none);
    expect(quoteRequestActions({ viewer: 'TARGET', status, hasLiveQuote: false })).toEqual(none);
  });
  it('another viewer never gets an action', () => {
    expect(quoteRequestActions({ viewer: 'OTHER', status: 'OPEN', hasLiveQuote: false })).toEqual(none);
  });
});

describe('repairerQuoteRequestLabel (the réparateur inbox row)', () => {
  const item = (over: Partial<RepairerQuoteRequestItem>): RepairerQuoteRequestItem => ({
    demandeId: 'd1',
    title: 'Écran',
    clientName: 'marie',
    status: 'OPEN',
    expiresAt: '2026-10-07T10:00:00.000Z',
    closedReason: null,
    liveQuote: null,
    createdAt: '2026-09-30T10:00:00.000Z',
    ...over,
  });

  it('OPEN with no quote reads « À traiter avant le {date} »', () => {
    expect(repairerQuoteRequestLabel(item({}))).toBe('À traiter avant le 7 octobre');
  });

  it('OPEN with no expiry falls back to « À traiter »', () => {
    expect(repairerQuoteRequestLabel(item({ expiresAt: null }))).toBe('À traiter');
  });

  it('OPEN with a live quote reads « Devis envoyé · {price} »', () => {
    const label = repairerQuoteRequestLabel(item({ expiresAt: null, liveQuote: { offerId: 'o1', priceCents: 8000 } }));
    expect(label.startsWith('Devis envoyé · ')).toBe(true);
    expect(label).toContain('80');
  });

  it('IN_PROGRESS and DONE read « Devis accepté »', () => {
    expect(repairerQuoteRequestLabel(item({ status: 'IN_PROGRESS' }))).toBe('Devis accepté');
    expect(repairerQuoteRequestLabel(item({ status: 'DONE' }))).toBe('Devis accepté');
  });

  it('CANCELLED reads each reason from the réparateur side', () => {
    const closed = (closedReason: RepairerQuoteRequestItem['closedReason']) =>
      repairerQuoteRequestLabel(item({ status: 'CANCELLED', closedReason }));
    expect(closed('DECLINED')).toBe('Vous avez refusé');
    expect(closed('EXPIRED')).toBe('Expirée sans réponse');
    expect(closed('QUOTE_REFUSED')).toBe('Devis refusé par le client');
    expect(closed('CANCELLED_BY_CLIENT')).toBe('Annulée par le client');
    expect(closed(null)).toBe('Annulée');
  });
});

describe('the request screen from the réparateur side (review I4)', () => {
  const info = (over: Partial<QuoteRequestInfo> = {}): QuoteRequestInfo => ({
    repairer: { userId: 'r1', displayName: 'Atelier Bob' },
    preferredTravel: null,
    details: null,
    expiresAt: null,
    closedReason: null,
    declineNote: null,
    ...over,
  });

  it('quoteRequestHeader names the client handle for the target, the réparateur for the author', () => {
    expect(quoteRequestHeader(info())).toBe('Demande de devis privée · Atelier Bob');
    expect(quoteRequestHeader(info(), { clientUsername: 'marie' })).toBe('Demande de devis privée · @marie');
    // No handle (stale API): a neutral word, never the réparateur's own name.
    expect(quoteRequestHeader(info(), { clientUsername: null })).toBe('Demande de devis privée · Client');
    // Deleted client: Utilisateur supprimé
    expect(quoteRequestHeader(info(), { clientUsername: 'supprime_qwl4hd7hereusjmah' }))
      .toBe('Demande de devis privée · Utilisateur supprimé');
  });

  it('quoteRequestTargetLabel: dedicated réparateur statuses (CF6-15)', () => {
    expect(quoteRequestTargetLabel(info(), 'OPEN', false)).toBe('À traiter');
    expect(quoteRequestTargetLabel(info(), 'OPEN', true)).toBe('Devis envoyé');
    expect(quoteRequestTargetLabel(info({ closedReason: 'DECLINED' }), 'CANCELLED', false)).toBe('Refusé');
    expect(quoteRequestTargetLabel(info({ closedReason: 'QUOTE_REFUSED' }), 'CANCELLED', false)).toBe('Refusé');
    expect(quoteRequestTargetLabel(info({ closedReason: 'CANCELLED_BY_CLIENT' }), 'CANCELLED', false)).toBe('Annulé');
    expect(quoteRequestTargetLabel(info(), 'IN_PROGRESS', true)).toBe('Devis accepté');
    expect(quoteRequestTargetLabel(info(), 'DONE', true)).toBe('Devis accepté');
  });
});
