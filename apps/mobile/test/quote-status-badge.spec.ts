import { describe, it, expect } from 'vitest';
import {
  privateQuoteListBadge,
  quoteBadge,
  quoteRequestLabel,
  quoteRequestTargetLabel,
  quoteClosedDetail,
  repairStatus,
  type DemandeDto,
  type QuoteRequestInfo,
  type ProgressCommande,
} from '@revime/shared';

describe('mobile quote status badge integration (CF6-15)', () => {
  const makeQuoteInfo = (closedReason: QuoteRequestInfo['closedReason'] = null): QuoteRequestInfo => ({
    repairer: { userId: 'rep-1', displayName: 'Atelier Phone' },
    preferredTravel: 'HOME',
    details: 'Écran brisé',
    expiresAt: '2026-10-17T12:00:00.000Z',
    closedReason,
    declineNote: closedReason === 'DECLINED' ? 'Indisponible cette semaine' : null,
  });

  const makeDemande = (overrides: Partial<DemandeDto> = {}): DemandeDto => ({
    id: 'demande-1',
    title: 'Réparation iPhone 13',
    description: 'Écran cassé',
    brand: 'Apple',
    model: 'iPhone 13',
    parts: 'UNKNOWN',
    mode: 'OFFERS',
    budgetCents: 10000,
    locationLabel: 'Paris 75011',
    postalCode: '75011',
    status: 'OPEN',
    commande: null,
    category: { id: 'cat-1', slug: 'smartphones', labelFr: 'Smartphones' },
    offerCount: 0,
    photos: null,
    photoUrls: [],
    distanceKm: null,
    author: null,
    quoteRequest: makeQuoteInfo(),
    isPrivate: true,
    createdAt: '2026-10-10T12:00:00.000Z',
    ...overrides,
  });

  it('renders "En attente de réponse" with amber tone for newly created private quote', () => {
    const d = makeDemande({ status: 'OPEN', offerCount: 0 });
    const badge = quoteBadge({
      status: d.status,
      hasLiveQuote: d.offerCount > 0,
      closedReason: d.quoteRequest?.closedReason,
      viewer: 'CLIENT',
    });

    expect(badge).toEqual({
      status: 'PENDING_REPLY',
      label: 'En attente de réponse',
      tone: 'amber',
    });
    expect(quoteRequestLabel(d.quoteRequest!, d.status, d.offerCount > 0)).toBe('En attente de réponse');
  });

  it('renders "Devis reçu" with amber tone when quote is submitted', () => {
    const d = makeDemande({ status: 'OPEN', offerCount: 1 });
    const badge = quoteBadge({
      status: d.status,
      hasLiveQuote: d.offerCount > 0,
      closedReason: d.quoteRequest?.closedReason,
      viewer: 'CLIENT',
    });

    expect(badge).toEqual({
      status: 'QUOTE_RECEIVED',
      label: 'Devis reçu',
      tone: 'amber',
    });
    expect(quoteRequestLabel(d.quoteRequest!, d.status, d.offerCount > 0)).toBe('Devis reçu');
  });

  it('renders "Devis accepté" with verified tone when quote is accepted/in progress', () => {
    const d = makeDemande({ status: 'IN_PROGRESS', offerCount: 1 });
    const badge = quoteBadge({
      status: d.status,
      hasLiveQuote: d.offerCount > 0,
      closedReason: d.quoteRequest?.closedReason,
      viewer: 'CLIENT',
    });

    expect(badge).toEqual({
      status: 'QUOTE_ACCEPTED',
      label: 'Devis accepté',
      tone: 'verified',
    });
    expect(quoteRequestLabel(d.quoteRequest!, d.status, d.offerCount > 0)).toBe('Devis accepté');
  });

  it('renders "Refusé" with danger tone when declined by repairer or refused by client', () => {
    const dDeclined = makeDemande({
      status: 'CANCELLED',
      quoteRequest: makeQuoteInfo('DECLINED'),
    });
    const badgeDeclined = quoteBadge({
      status: dDeclined.status,
      hasLiveQuote: false,
      closedReason: dDeclined.quoteRequest?.closedReason,
      viewer: 'CLIENT',
    });
    expect(badgeDeclined).toEqual({
      status: 'REFUSED',
      label: 'Refusé',
      tone: 'danger',
    });

    const dRefused = makeDemande({
      status: 'CANCELLED',
      quoteRequest: makeQuoteInfo('QUOTE_REFUSED'),
    });
    const badgeRefused = quoteBadge({
      status: dRefused.status,
      hasLiveQuote: true,
      closedReason: dRefused.quoteRequest?.closedReason,
      viewer: 'CLIENT',
    });
    expect(badgeRefused).toEqual({
      status: 'REFUSED',
      label: 'Refusé',
      tone: 'danger',
    });
  });

  it('renders "Annulé" with neutral tone when cancelled by client or expired', () => {
    const dCancelled = makeDemande({
      status: 'CANCELLED',
      quoteRequest: makeQuoteInfo('CANCELLED_BY_CLIENT'),
    });
    const badgeCancelled = quoteBadge({
      status: dCancelled.status,
      hasLiveQuote: false,
      closedReason: dCancelled.quoteRequest?.closedReason,
      viewer: 'CLIENT',
    });
    expect(badgeCancelled).toEqual({
      status: 'CANCELLED',
      label: 'Annulé',
      tone: 'neutral',
    });

    const dExpired = makeDemande({
      status: 'CANCELLED',
      quoteRequest: makeQuoteInfo('EXPIRED'),
    });
    const badgeExpired = quoteBadge({
      status: dExpired.status,
      hasLiveQuote: false,
      closedReason: dExpired.quoteRequest?.closedReason,
      viewer: 'CLIENT',
    });
    expect(badgeExpired).toEqual({
      status: 'CANCELLED',
      label: 'Annulé',
      tone: 'neutral',
    });
  });

  it('renders role-adapted labels for repairer viewer', () => {
    const info = makeQuoteInfo();
    expect(quoteRequestTargetLabel(info, 'OPEN', false)).toBe('À traiter');
    expect(quoteRequestTargetLabel(info, 'OPEN', true)).toBe('Devis envoyé');
    expect(quoteRequestTargetLabel(info, 'IN_PROGRESS', true)).toBe('Devis accepté');
    expect(quoteRequestTargetLabel(makeQuoteInfo('DECLINED'), 'CANCELLED', false)).toBe('Refusé');
    expect(quoteRequestTargetLabel(makeQuoteInfo('CANCELLED_BY_CLIENT'), 'CANCELLED', false)).toBe('Annulé');
  });

  it('provides explanatory closure descriptions via quoteClosedDetail', () => {
    expect(quoteClosedDetail('DECLINED', 'CLIENT')).toBe('Refusée par le réparateur');
    expect(quoteClosedDetail('EXPIRED', 'CLIENT')).toBe('Expirée : aucune réponse sous 7 jours');
    expect(quoteClosedDetail('QUOTE_REFUSED', 'CLIENT')).toBe('Devis refusé par vous');
    expect(quoteClosedDetail('CANCELLED_BY_CLIENT', 'CLIENT')).toBe('Demande annulée');

    expect(quoteClosedDetail('DECLINED', 'REPAIRER')).toBe('Vous avez refusé cette demande');
    expect(quoteClosedDetail('EXPIRED', 'REPAIRER')).toBe('Expirée sans réponse');
    expect(quoteClosedDetail('QUOTE_REFUSED', 'REPAIRER')).toBe('Devis refusé par le client');
    expect(quoteClosedDetail('CANCELLED_BY_CLIENT', 'REPAIRER')).toBe('Annulée par le client');
    expect(quoteClosedDetail(null, 'CLIENT')).toBeNull();
  });

  it('ensures dispute and refund states take precedence over quoteBadge in list views', () => {
    const disputedCommande: ProgressCommande = {
      status: 'PAID',
      step: null,
      commandeId: 'cmd-1',
      delivery: 'WORKSHOP',
      disputeOpen: true,
      cancellationPending: false,
    };

    const d = makeDemande({
      status: 'IN_PROGRESS',
      commande: disputedCommande,
      quoteRequest: makeQuoteInfo(),
    });

    const status = repairStatus(
      { demandeStatus: d.status, offerCount: d.offerCount, commande: d.commande },
      'CLIENT',
    );
    expect(status.disputed).toBe(true);

    const ladderOverrides =
      status.disputed || status.cancellationPending || d.commande?.status === 'REFUNDED';
    expect(ladderOverrides).toBe(true);

    // The production function declines to speak, so the screens fall back to the ladder's
    // label and tone: the dispute stays visible instead of reading « Devis accepté ».
    const listBadge = privateQuoteListBadge({
      isPrivate: d.isPrivate,
      quoteRequest: d.quoteRequest,
      status: d.status,
      offerCount: d.offerCount,
      ladderOverrides,
    }) ?? { label: status.label, tone: status.tone };

    expect(listBadge.tone).toBe('danger');
    expect(listBadge.label).toBe('Litige en cours');
  });

  it('shows the lifecycle badge for a private row, and nothing for a public one', () => {
    const base = { status: 'OPEN' as const, offerCount: 1, ladderOverrides: false };
    const priv = makeDemande();
    expect(
      privateQuoteListBadge({ ...base, isPrivate: true, quoteRequest: priv.quoteRequest })?.label,
    ).toBe('Devis reçu');
    expect(privateQuoteListBadge({ ...base, isPrivate: false, quoteRequest: null })).toBeNull();
    // Privacy comes from the flag AND the info: neither alone is enough to render the badge.
    expect(privateQuoteListBadge({ ...base, isPrivate: true, quoteRequest: null })).toBeNull();
  });
});
