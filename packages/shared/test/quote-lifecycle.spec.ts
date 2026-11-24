import { describe, expect, it } from 'vitest';
import {
  getQuoteLifecycleStatus,
  quoteBadge,
  quoteLifecycleStatusSchema,
  quoteRequestLabel,
  quoteRequestTargetLabel,
  type QuoteRequestInfo,
} from '../src/quote-request.js';

describe('quote lifecycle statuses (CF6-15)', () => {
  const dummyInfo = (closedReason: QuoteRequestInfo['closedReason'] = null): QuoteRequestInfo => ({
    repairer: { userId: 'r1', displayName: 'Atelier Martin' },
    preferredTravel: null,
    details: null,
    expiresAt: null,
    closedReason,
    declineNote: null,
  });

  describe('quoteLifecycleStatusSchema', () => {
    it('contains the 5 canonical statuses', () => {
      expect(quoteLifecycleStatusSchema.options).toEqual([
        'PENDING_REPLY',
        'QUOTE_RECEIVED',
        'QUOTE_ACCEPTED',
        'REFUSED',
        'CANCELLED',
      ]);
    });
  });

  describe('getQuoteLifecycleStatus', () => {
    it('OPEN without quote is PENDING_REPLY', () => {
      expect(getQuoteLifecycleStatus({ status: 'OPEN', hasLiveQuote: false })).toBe('PENDING_REPLY');
    });

    it('OPEN with live quote is QUOTE_RECEIVED', () => {
      expect(getQuoteLifecycleStatus({ status: 'OPEN', hasLiveQuote: true })).toBe('QUOTE_RECEIVED');
    });

    it('IN_PROGRESS or DONE is QUOTE_ACCEPTED', () => {
      expect(getQuoteLifecycleStatus({ status: 'IN_PROGRESS', hasLiveQuote: true })).toBe('QUOTE_ACCEPTED');
      expect(getQuoteLifecycleStatus({ status: 'DONE', hasLiveQuote: true })).toBe('QUOTE_ACCEPTED');
    });

    it('CANCELLED with DECLINED or QUOTE_REFUSED is REFUSED', () => {
      expect(getQuoteLifecycleStatus({ status: 'CANCELLED', hasLiveQuote: false, closedReason: 'DECLINED' })).toBe('REFUSED');
      expect(getQuoteLifecycleStatus({ status: 'CANCELLED', hasLiveQuote: true, closedReason: 'QUOTE_REFUSED' })).toBe('REFUSED');
    });

    it('CANCELLED with CANCELLED_BY_CLIENT, EXPIRED or null is CANCELLED', () => {
      expect(getQuoteLifecycleStatus({ status: 'CANCELLED', hasLiveQuote: false, closedReason: 'CANCELLED_BY_CLIENT' })).toBe('CANCELLED');
      expect(getQuoteLifecycleStatus({ status: 'CANCELLED', hasLiveQuote: false, closedReason: 'EXPIRED' })).toBe('CANCELLED');
      expect(getQuoteLifecycleStatus({ status: 'CANCELLED', hasLiveQuote: false, closedReason: null })).toBe('CANCELLED');
    });
  });

  describe('quoteBadge', () => {
    describe('CLIENT viewer', () => {
      it('PENDING_REPLY → En attente de réponse (amber)', () => {
        expect(quoteBadge({ status: 'OPEN', hasLiveQuote: false, viewer: 'CLIENT' })).toEqual({
          status: 'PENDING_REPLY',
          label: 'En attente de réponse',
          tone: 'amber',
        });
      });

      it('QUOTE_RECEIVED → Devis reçu (amber)', () => {
        expect(quoteBadge({ status: 'OPEN', hasLiveQuote: true, viewer: 'CLIENT' })).toEqual({
          status: 'QUOTE_RECEIVED',
          label: 'Devis reçu',
          tone: 'amber',
        });
      });

      it('QUOTE_ACCEPTED → Devis accepté (verified)', () => {
        expect(quoteBadge({ status: 'IN_PROGRESS', hasLiveQuote: true, viewer: 'CLIENT' })).toEqual({
          status: 'QUOTE_ACCEPTED',
          label: 'Devis accepté',
          tone: 'verified',
        });
      });

      it('REFUSED → Refusé (danger)', () => {
        expect(quoteBadge({ status: 'CANCELLED', hasLiveQuote: false, closedReason: 'DECLINED', viewer: 'CLIENT' })).toEqual({
          status: 'REFUSED',
          label: 'Refusé',
          tone: 'danger',
        });
      });

      it('CANCELLED → Annulé (neutral)', () => {
        expect(quoteBadge({ status: 'CANCELLED', hasLiveQuote: false, closedReason: 'CANCELLED_BY_CLIENT', viewer: 'CLIENT' })).toEqual({
          status: 'CANCELLED',
          label: 'Annulé',
          tone: 'neutral',
        });
      });
    });

    describe('REPAIRER viewer', () => {
      it('PENDING_REPLY → À traiter (amber)', () => {
        expect(quoteBadge({ status: 'OPEN', hasLiveQuote: false, viewer: 'REPAIRER' })).toEqual({
          status: 'PENDING_REPLY',
          label: 'À traiter',
          tone: 'amber',
        });
      });

      it('QUOTE_RECEIVED → Devis envoyé (amber)', () => {
        expect(quoteBadge({ status: 'OPEN', hasLiveQuote: true, viewer: 'REPAIRER' })).toEqual({
          status: 'QUOTE_RECEIVED',
          label: 'Devis envoyé',
          tone: 'amber',
        });
      });

      it('QUOTE_ACCEPTED → Devis accepté (verified)', () => {
        expect(quoteBadge({ status: 'IN_PROGRESS', hasLiveQuote: true, viewer: 'REPAIRER' })).toEqual({
          status: 'QUOTE_ACCEPTED',
          label: 'Devis accepté',
          tone: 'verified',
        });
      });

      it('REFUSED → Refusé (danger)', () => {
        expect(quoteBadge({ status: 'CANCELLED', hasLiveQuote: false, closedReason: 'DECLINED', viewer: 'REPAIRER' })).toEqual({
          status: 'REFUSED',
          label: 'Refusé',
          tone: 'danger',
        });
      });

      it('CANCELLED → Annulé (neutral)', () => {
        expect(quoteBadge({ status: 'CANCELLED', hasLiveQuote: false, closedReason: 'CANCELLED_BY_CLIENT', viewer: 'REPAIRER' })).toEqual({
          status: 'CANCELLED',
          label: 'Annulé',
          tone: 'neutral',
        });
      });
    });
  });

  describe('quoteRequestLabel (client)', () => {
    it('returns dedicated labels across all statuses', () => {
      expect(quoteRequestLabel(dummyInfo(), 'OPEN', false)).toBe('En attente de réponse');
      expect(quoteRequestLabel(dummyInfo(), 'OPEN', true)).toBe('Devis reçu');
      expect(quoteRequestLabel(dummyInfo(), 'IN_PROGRESS', true)).toBe('Devis accepté');
      expect(quoteRequestLabel(dummyInfo(), 'DONE', true)).toBe('Devis accepté');
      expect(quoteRequestLabel(dummyInfo('DECLINED'), 'CANCELLED', false)).toBe('Refusé');
      expect(quoteRequestLabel(dummyInfo('QUOTE_REFUSED'), 'CANCELLED', true)).toBe('Refusé');
      expect(quoteRequestLabel(dummyInfo('CANCELLED_BY_CLIENT'), 'CANCELLED', false)).toBe('Annulé');
      expect(quoteRequestLabel(dummyInfo('EXPIRED'), 'CANCELLED', false)).toBe('Annulé');
    });
  });

  describe('quoteRequestTargetLabel (repairer)', () => {
    it('returns dedicated labels across all statuses', () => {
      expect(quoteRequestTargetLabel(dummyInfo(), 'OPEN', false)).toBe('À traiter');
      expect(quoteRequestTargetLabel(dummyInfo(), 'OPEN', true)).toBe('Devis envoyé');
      expect(quoteRequestTargetLabel(dummyInfo(), 'IN_PROGRESS', true)).toBe('Devis accepté');
      expect(quoteRequestTargetLabel(dummyInfo(), 'DONE', true)).toBe('Devis accepté');
      expect(quoteRequestTargetLabel(dummyInfo('DECLINED'), 'CANCELLED', false)).toBe('Refusé');
      expect(quoteRequestTargetLabel(dummyInfo('QUOTE_REFUSED'), 'CANCELLED', true)).toBe('Refusé');
      expect(quoteRequestTargetLabel(dummyInfo('CANCELLED_BY_CLIENT'), 'CANCELLED', false)).toBe('Annulé');
      expect(quoteRequestTargetLabel(dummyInfo('EXPIRED'), 'CANCELLED', false)).toBe('Annulé');
    });
  });
});
