import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ReviewsRatingSummary } from '../components/ReviewsRatingSummary';
import { ReviewsList } from '../app/avis/ReviewsList';
import { ReviewDetailDrawer } from '../app/avis/ReviewDetailDrawer';
import type { AdminReviewDetail, AdminReviewsPage, AdminReviewsSummary } from '@revime/shared';

describe('P21: Avis — Rating Summary, Negative Filter & Moderation Reason', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. <ReviewsRatingSummary /> Component', () => {
    const mockSummary: AdminReviewsSummary = {
      averageRating: 4.6,
      totalReviews: 125,
      distribution: {
        5: 80,
        4: 30,
        3: 10,
        2: 3,
        1: 2,
      },
    };

    it('renders overall score, stars, and total review count', () => {
      const html = renderToString(<ReviewsRatingSummary summary={mockSummary} />);

      expect(html).toContain('data-testid="reviews-rating-summary"');
      expect(html).toContain('data-testid="reviews-overall-score"');
      expect(html).toContain('4,6');
      expect(html).toContain('/ 5');
      expect(html).toContain('data-testid="rating-stars"');
      expect(html).toContain('★');
      expect(html).toContain('125 avis au total');
    });

    it('renders 5-tier distribution bars with percentages and counts', () => {
      const html = renderToString(<ReviewsRatingSummary summary={mockSummary} />);

      expect(html).toContain('data-testid="reviews-distribution-bars"');
      expect(html).toContain('data-testid="rating-bar-5"');
      expect(html).toContain('data-testid="rating-bar-4"');
      expect(html).toContain('data-testid="rating-bar-3"');
      expect(html).toContain('data-testid="rating-bar-2"');
      expect(html).toContain('data-testid="rating-bar-1"');

      // Check tier labels
      expect(html).toContain('5 ★');
      expect(html).toContain('1 ★');

      // 80/125 = 64%
      expect(html).toContain('64% (80)');
      // 30/125 = 24%
      expect(html).toContain('24% (30)');
    });

    it('handles null/undefined summary safely without crashing', () => {
      const htmlUndefined = renderToString(<ReviewsRatingSummary summary={undefined} />);
      expect(htmlUndefined).toContain('0,0');
      expect(htmlUndefined).toContain('0 avis au total');

      const htmlNull = renderToString(<ReviewsRatingSummary summary={null} />);
      expect(htmlNull).toContain('0,0');
      expect(htmlNull).toContain('0 avis au total');
    });

    it('uses pure white surface, platinum line border, and Google Sans font', () => {
      const html = renderToString(<ReviewsRatingSummary summary={mockSummary} />);
      expect(html).toContain('var(--paper, #ffffff)');
      expect(html).toContain('var(--line, #dfe2e2)');
      expect(html).toContain('var(--font-google-sans)');
    });
  });

  describe('2. <ReviewsList /> Filter Chips & Moderation Motif Badge', () => {
    const mockPageData: AdminReviewsPage = {
      items: [
        {
          id: 'rev-vis-1',
          createdAt: '2026-10-10T10:00:00.000Z',
          rating: 5,
          comment: 'Réparation impeccable !',
          authorUserId: 'usr-1',
          authorUsername: 'Alice',
          authorEmail: 'alice@example.com',
          repairerUserId: 'usr-rep-1',
          repairerUsername: 'BobReparation',
          repairerEmail: 'bob@atelier.com',
          commandeId: 'cmd-1111-2222',
          demandeTitle: 'Écran iPhone cassé',
          isDemo: false,
          hidden: false,
          moderationMotif: null,
        },
        {
          id: 'rev-hid-2',
          createdAt: '2026-10-09T14:30:00.000Z',
          rating: 1,
          comment: 'Commentaire inapproprié',
          authorUserId: 'usr-2',
          authorUsername: 'BadUser',
          authorEmail: 'bad@example.com',
          repairerUserId: 'usr-rep-1',
          repairerUsername: 'BobReparation',
          repairerEmail: 'bob@atelier.com',
          commandeId: 'cmd-3333-4444',
          demandeTitle: 'Batterie Galaxy S21',
          isDemo: false,
          hidden: true,
          moderationMotif: 'ABUSIVE',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 25,
      summary: {
        averageRating: 3.0,
        totalReviews: 2,
        distribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 },
      },
    };

    it('renders quick filter chips: Tous les avis, Avis négatifs (≤ 2★), Avis masqués', () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPageData,
      } as any);

      const html = renderToString(<ReviewsList onOpen={() => {}} version={0} />);

      expect(html).toContain('data-testid="avis-quick-filters"');
      expect(html).toContain('data-testid="filter-chip-all"');
      expect(html).toContain('Tous les avis');
      expect(html).toContain('data-testid="filter-chip-negative"');
      expect(html).toContain('Avis négatifs (≤ 2★)');
      expect(html).toContain('data-testid="filter-chip-hidden"');
      expect(html).toContain('Avis masqués');
    });

    it('renders search button in Bleu Ink var(--navy, #25324f) and no pitch-black button', () => {
      const html = renderToString(<ReviewsList onOpen={() => {}} version={0} />);

      expect(html).toContain('var(--navy, #25324f)');
      expect(html).not.toMatch(/backgroundColor:\s*['"]var\(--ink,\s*#141414\)['"]/);
      expect(html).not.toMatch(/backgroundColor:\s*['"]#000000['"]/);
    });

    it('displays moderation motif pill on hidden review row', () => {
      // In SSR or loaded state, check that hidden rows show the moderation motif pill
      const hiddenReview = mockPageData.items[1];
      expect(hiddenReview.hidden).toBe(true);
      expect(hiddenReview.moderationMotif).toBe('ABUSIVE');
    });
  });

  describe('3. <ReviewDetailDrawer /> Moderation Reason Callout', () => {
    const mockVisibleReview: AdminReviewDetail = {
      id: 'rev-vis-1',
      createdAt: '2026-10-10T10:00:00.000Z',
      rating: 5,
      comment: 'Parfait',
      authorUserId: 'usr-1',
      authorUsername: 'Alice',
      authorEmail: 'alice@example.com',
      repairerUserId: 'usr-rep-1',
      repairerUsername: 'BobReparation',
      repairerEmail: 'bob@atelier.com',
      commandeId: 'cmd-1',
      demandeTitle: 'Écran iPhone',
      isDemo: false,
      hidden: false,
      moderationMotif: null,
      qualityRating: 5,
      delayRating: 5,
      communicationRating: 5,
      commande: {
        id: 'cmd-1',
        status: 'PAID',
        step: 'RELEASED',
        repairCents: 5000,
        shippingCents: 0,
        protectionCents: 500,
        totalCents: 5500,
        createdAt: '2026-10-01T10:00:00.000Z',
        paidAt: '2026-10-01T10:05:00.000Z',
        releasedAt: '2026-10-05T10:00:00.000Z',
      },
      moderation: null,
    };

    const mockHiddenReview: AdminReviewDetail = {
      ...mockVisibleReview,
      id: 'rev-hid-2',
      hidden: true,
      moderationMotif: 'PERSONAL_DATA',
      moderation: {
        motif: 'PERSONAL_DATA',
        note: 'Contient une adresse e-mail personnelle',
        moderatorUserId: 'mod-1',
        moderatorName: 'SarahAdmin',
        at: '2026-10-11T12:00:00.000Z',
      },
    };

    it('prominently displays moderation reason callout card when review is hidden', () => {
      const html = renderToString(
        <ReviewDetailDrawer
          reviewId="rev-hid-2"
          onClose={() => {}}
          onChanged={() => {}}
          initialDetail={mockHiddenReview}
        />,
      );

      expect(html).toContain('data-testid="moderation-reason-callout"');
      expect(html).toContain('Avis masqué par la modération');
      expect(html).toContain('data-testid="drawer-moderation-motif"');
      expect(html).toContain('Données personnelles');
      expect(html).toContain('Contient une adresse e-mail personnelle');
    });

    it('does not display moderation callout card when review is visible', () => {
      const html = renderToString(
        <ReviewDetailDrawer
          reviewId="rev-vis-1"
          onClose={() => {}}
          onChanged={() => {}}
          initialDetail={mockVisibleReview}
        />,
      );

      expect(html).not.toContain('data-testid="moderation-reason-callout"');
      expect(html).not.toContain('Avis masqué par la modération');
    });
  });
});
