'use client';

import React from 'react';
import type { AdminReviewsSummary } from '@revime/shared';
import { formatCount } from '../lib/money';

export interface ReviewsRatingSummaryProps {
  summary?: AdminReviewsSummary | null;
}

export function ReviewsRatingSummary({ summary }: ReviewsRatingSummaryProps) {
  const averageRating = summary?.averageRating ?? 0;
  const totalReviews = summary?.totalReviews ?? 0;
  const distribution = summary?.distribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  const formattedAverage = averageRating > 0 ? averageRating.toFixed(1).replace('.', ',') : '0,0';

  const tiers = [5, 4, 3, 2, 1] as const;

  return (
    <div
      data-testid="reviews-rating-summary"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 10px)',
        padding: '20px 24px',
        marginBottom: '20px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '24px',
        alignItems: 'center',
      }}
    >
      {/* Big Score Panel */}
      <div
        data-testid="reviews-score-panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '12px 16px',
          borderRight: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--muted, #6b7280)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '4px',
          }}
        >
          Note globale
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '4px 0' }}>
          <span
            data-testid="reviews-overall-score"
            style={{
              fontSize: '40px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
              lineHeight: 1,
            }}
          >
            {formattedAverage}
          </span>
          <span style={{ fontSize: '18px', color: 'var(--muted, #6b7280)', fontWeight: 500 }}>/ 5</span>
        </div>

        {/* Stars */}
        <div
          data-testid="rating-stars"
          style={{
            display: 'flex',
            gap: '3px',
            margin: '6px 0',
            color: 'var(--badge-warning-text)',
            fontSize: '18px',
          }}
          aria-label={`${formattedAverage} sur 5 étoiles`}
        >
          {[1, 2, 3, 4, 5].map((starIndex) => {
            const filled = starIndex <= Math.round(averageRating);
            return (
              <span key={starIndex} style={{ color: filled ? 'var(--badge-warning-text)' : 'var(--line)' }}>
                ★
              </span>
            );
          })}
        </div>

        <span
          data-testid="reviews-total-count"
          style={{
            fontSize: '13px',
            color: 'var(--muted, #6b7280)',
          }}
        >
          {`${formatCount(totalReviews)} avis au total`}
        </span>
      </div>

      {/* 5-Tier Distribution Bars */}
      <div
        data-testid="reviews-distribution-bars"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          justifyContent: 'center',
        }}
      >
        {tiers.map((tier) => {
          const count = distribution[tier] ?? 0;
          const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;

          return (
            <div
              key={tier}
              data-testid={`rating-bar-${tier}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr 80px',
                alignItems: 'center',
                gap: '12px',
                fontSize: '13px',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--ink, #141414)', whiteSpace: 'nowrap' }}>
                {`${tier} ★`}
              </span>
              <div
                style={{
                  height: '8px',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${percentage}%`,
                    backgroundColor: 'var(--badge-warning-text)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <span
                style={{
                  color: 'var(--muted, #6b7280)',
                  fontSize: '12px',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${percentage}% (${formatCount(count)})`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
