import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ReviewDetailDrawer } from '../app/avis/ReviewDetailDrawer';

describe('Bug B9: ReviewDetailDrawer visible close button', () => {
  it('renders a visible close button with "✕" icon instead of invisible white text', () => {
    const html = renderToString(
      <ReviewDetailDrawer
        reviewId="rev-123"
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    // Dialog structure
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Avis');

    // Close button must have visible "✕" icon, not "Fermer" text
    expect(html).toContain('data-testid="close-review-drawer"');
    expect(html).toContain('✕');
    expect(html).not.toContain('>Fermer</button>');

    // Must have accessible label
    expect(html).toMatch(/aria-label="Fermer( les détails de l(&#x27;|')avis)?"/);

    // Must have explicit visible color (never inherit default white button text on white bg)
    expect(html).toMatch(/color:var\(--muted, #6b7280\)|color:#6b7280|color:var\(--ink/);
  });

  it('renders nothing when reviewId is null', () => {
    const html = renderToString(
      <ReviewDetailDrawer
        reviewId={null}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(html).toBe('');
  });
});
