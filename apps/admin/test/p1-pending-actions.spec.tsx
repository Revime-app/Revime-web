import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PendingActionsBlock } from '../components/PendingActionsBlock';
import type { AdminPendingActions } from '@revime/shared';

describe('P1: PendingActionsBlock (« À traiter »)', () => {
  const sampleActions: AdminPendingActions = {
    litiges: 4,
    verifications: 2,
    signalements: 1,
    annulations: 3,
    attention: 5,
    stalePayments: 7,
  };

  const zeroActions: AdminPendingActions = {
    litiges: 0,
    verifications: 0,
    signalements: 0,
    annulations: 0,
    attention: 0,
    stalePayments: 0,
  };

  it('renders section landmark with title "À traiter"', () => {
    const html = renderToString(<PendingActionsBlock actions={sampleActions} />);
    expect(html).toContain('aria-labelledby="pending-actions-title"');
    expect(html).toContain('id="pending-actions-title"');
    expect(html).toContain('À traiter');
  });

  it('renders all 6 required card headings', () => {
    const html = renderToString(<PendingActionsBlock actions={sampleActions} />);
    expect(html).toContain('Litiges en cours');
    expect(html).toContain('Vérifications en attente');
    expect(html).toContain('Signalements en attente');
    expect(html).toContain('Annulations en attente');
    expect(html).toContain('Commandes à surveiller');
    expect(html).toContain('Paiements en attente (&gt; 24 h)');
  });

  it('renders strictly correct link destinations for all 6 queues', () => {
    const html = renderToString(<PendingActionsBlock actions={sampleActions} />);
    expect(html).toContain('href="/litiges"');
    expect(html).toContain('href="/verifications?needsAction=true"');
    expect(html).toContain('href="/signalements"');
    expect(html).toContain('href="/annulations"');
    expect(html).toContain('href="/attention"');
  });

  it('points each card at the page that lists what the card counts', () => {
    const html = renderToString(<PendingActionsBlock actions={sampleActions} />);
    const card = (key: string) => html.match(new RegExp(`data-testid="pending-card-${key}" href="([^"]*)"`))?.[1];
    // « Litiges en cours » counts open AND under review: the unfiltered page carries both tabs, ?status=OPEN would show fewer rows.
    expect(card('litiges')).toBe('/litiges');
    // The stale payments are counted from the « Commandes à surveiller » list, so that is where they are.
    expect(card('stalePayments')).toBe('/attention');
    expect(card('attention')).toBe('/attention');
  });

  it('renders exact counts in card body for all queues', () => {
    const html = renderToString(<PendingActionsBlock actions={sampleActions} />);
    expect(html).toContain('<span class="pending-card__count">4</span>');
    expect(html).toContain('<span class="pending-card__count">2</span>');
    expect(html).toContain('<span class="pending-card__count">1</span>');
    expect(html).toContain('<span class="pending-card__count">3</span>');
    expect(html).toContain('<span class="pending-card__count">5</span>');
    expect(html).toContain('<span class="pending-card__count">7</span>');
  });

  it('renders Rouge Punch pill badges (pending-card__badge--urgent) when count > 0', () => {
    const html = renderToString(<PendingActionsBlock actions={sampleActions} />);
    // Active / urgent badges
    expect(html).toContain('pending-card__badge--urgent');
    expect(html).not.toContain('pending-card__badge--neutral');
    expect(html).toContain('4 à traiter');
    expect(html).toContain('2 à traiter');
    expect(html).toContain('1 à traiter');
    expect(html).toContain('3 à traiter');
    expect(html).toContain('5 à traiter');
    expect(html).toContain('7 à traiter');
  });

  it('renders neutral badge with "0 à traiter" when count === 0', () => {
    const html = renderToString(<PendingActionsBlock actions={zeroActions} />);
    expect(html).not.toContain('pending-card__badge--urgent');
    expect(html).toContain('pending-card__badge--neutral');
    // All 6 should show 0 à traiter
    const zeroMatches = html.match(/0 à traiter/g);
    expect(zeroMatches).toHaveLength(6);
  });

  it('renders mixed active and neutral states accurately', () => {
    const mixedActions: AdminPendingActions = {
      litiges: 3,
      verifications: 0,
      signalements: 1,
      annulations: 0,
      attention: 2,
      stalePayments: 0,
    };
    const html = renderToString(<PendingActionsBlock actions={mixedActions} />);

    // Active
    expect(html).toContain('3 à traiter');
    expect(html).toContain('1 à traiter');
    expect(html).toContain('2 à traiter');

    // Neutral
    const zeroMatches = html.match(/0 à traiter/g);
    expect(zeroMatches).toHaveLength(3);
  });
});
