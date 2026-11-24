import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DemandeActionForms } from '../components/DemandeActionForms';

describe('Bug B14: DemandeActionForms with paymentInFlight', () => {
  it('disables and refuses Masquer and Supprimer actions when payment is in flight', () => {
    const act = vi.fn();
    const html = renderToString(
      <DemandeActionForms
        id="demande-1"
        categoryId="cat-1"
        state="visible"
        paymentInFlight={true}
        busy={false}
        act={act}
      />,
    );

    // 1. Shows a clear refusal notice in the actions block
    expect(html).toContain('data-testid="demande-payment-in-flight-actions-notice"');
    expect(html).toContain('paiement est en cours');

    // 2. Masquer summary is marked disabled and not allowed
    expect(html).toContain('data-testid="hide-demande-summary"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toMatch(/hide-demande-summary[^>]*style="[^"]*cursor:\s*not-allowed/);
    expect(html).toContain('paiement en cours');

    // 3. Supprimer summary is marked disabled and not allowed
    expect(html).toContain('data-testid="delete-demande-summary"');
    expect(html).toMatch(/delete-demande-summary[^>]*style="[^"]*cursor:\s*not-allowed/);

    // 4. Input fields inside forms are disabled
    expect(html).toContain('data-testid="hide-demande-reason"');
    expect(html).toMatch(/data-testid="hide-demande-reason"[^>]*disabled=""/);
    expect(html).toContain('data-testid="delete-demande-reason"');
    expect(html).toMatch(/data-testid="delete-demande-reason"[^>]*disabled=""/);

    // 5. Action submit buttons are disabled
    expect(html).toContain('data-testid="hide-demande-button"');
    expect(html).toMatch(/data-testid="hide-demande-button"[^>]*disabled=""/);
    expect(html).toContain('data-testid="delete-demande-button"');
    expect(html).toMatch(/data-testid="delete-demande-button"[^>]*disabled=""/);
  });

  it('keeps Masquer and Supprimer active and clickable when payment is NOT in flight', () => {
    const act = vi.fn();
    const html = renderToString(
      <DemandeActionForms
        id="demande-1"
        categoryId="cat-1"
        state="visible"
        paymentInFlight={false}
        busy={false}
        act={act}
      />,
    );

    // 1. No refusal notice in actions
    expect(html).not.toContain('data-testid="demande-payment-in-flight-actions-notice"');

    // 2. Summaries are interactive with pointer cursor
    expect(html).toContain('data-testid="hide-demande-summary"');
    expect(html).toMatch(/hide-demande-summary[^>]*style="[^"]*cursor:\s*pointer/);
    expect(html).not.toContain('aria-disabled="true"');

    expect(html).toContain('data-testid="delete-demande-summary"');
    expect(html).toMatch(/delete-demande-summary[^>]*style="[^"]*cursor:\s*pointer/);

    // 3. Inputs are not disabled when idle
    expect(html).not.toMatch(/data-testid="hide-demande-reason"[^>]*disabled=""/);
    expect(html).not.toMatch(/data-testid="delete-demande-reason"[^>]*disabled=""/);
  });

  it('allows unhide but disables Supprimer when state is masquée and payment is in flight', () => {
    const act = vi.fn();
    const html = renderToString(
      <DemandeActionForms
        id="demande-1"
        categoryId="cat-1"
        state="masquee"
        paymentInFlight={true}
        busy={false}
        act={act}
      />,
    );

    // 1. Unhide (Réafficher la demande) is rendered and NOT disabled by paymentInFlight
    expect(html).toContain('Réafficher la demande');
    expect(html).not.toMatch(/Réafficher la demande[^<]*<\/button>[^>]*disabled/);

    // 2. Hide section is not rendered for already-masked demand
    expect(html).not.toContain('data-testid="hide-demande-summary"');

    // 3. Supprimer summary is still locked down
    expect(html).toContain('data-testid="delete-demande-summary"');
    expect(html).toMatch(/delete-demande-summary[^>]*style="[^"]*cursor:\s*not-allowed/);
    expect(html).toMatch(/data-testid="delete-demande-button"[^>]*disabled=""/);
  });
});
