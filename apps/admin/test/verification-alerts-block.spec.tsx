import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminVerificationAlert } from '@revime/shared';
import { VerificationAlertsBlock } from '../components/VerificationAlertsBlock';

describe('A-3: VerificationAlertsBlock Component', () => {
  const sampleAlerts: AdminVerificationAlert[] = [
    {
      id: 'alert-1',
      type: 'MALFORMED_NIF',
      severity: 'CRITICAL',
      title: 'NIF mal formé · Jordan B.',
      detail: '« 12345 » : 13 chiffres attendus, commençant par 0, 1, 2 ou 3.',
      userId: 'usr-jordan-1',
      userName: 'Jordan B.',
      userHref: '/utilisateurs/usr-jordan-1',
    },
    {
      id: 'alert-2',
      type: 'DUPLICATE_NIF',
      severity: 'CRITICAL',
      title: 'Même NIF sur 2 comptes · Sarah K. et Sarah Karim',
      detail: 'NIF « •••• 012 » utilisé par deux réparateurs.',
      userId: 'usr-sarah-1',
      userName: 'Sarah K. et Sarah Karim',
      userHref: '/utilisateurs/usr-sarah-1',
    },
    {
      id: 'alert-3',
      type: 'DUPLICATE_IBAN',
      severity: 'CRITICAL',
      title: 'Même IBAN sur 2 comptes · Lucas D. et Lucas Dubois',
      detail: '•••• 7781 utilisé par deux réparateurs.',
      userId: 'usr-lucas-1',
      userName: 'Lucas D. et Lucas Dubois',
      userHref: '/utilisateurs/usr-lucas-1',
    },
    {
      id: 'alert-4',
      type: 'NO_NIF_OVER_25',
      severity: 'WARNING',
      title: '« Pas de NIF » coché, 41 ans · Karim T.',
      detail: 'À vérifier : demander un justificatif.',
      userId: 'usr-karim-1',
      userName: 'Karim T.',
      userHref: '/utilisateurs/usr-karim-1',
    },
    {
      id: 'alert-5',
      type: 'PARTICULAR_QUOTA_80_PERCENT',
      severity: 'WARNING',
      title: '80 % du plafond particulier · Camille Martin',
      detail: '8 missions et 1 140 € sur 12 mois.',
      userId: 'usr-camille-1',
      userName: 'Camille Martin',
      userHref: '/utilisateurs/usr-camille-1',
    },
  ];

  it('renders section title and card matching mockup page9_img2.png', () => {
    const html = renderToString(<VerificationAlertsBlock initialAlerts={sampleAlerts} />);

    expect(html).toContain('Dossiers nécessitant une action');
    expect(html).toContain('data-testid="verification-alerts-card"');
  });

  it('renders all alert titles and descriptions verbatim from mockup', () => {
    const html = renderToString(<VerificationAlertsBlock initialAlerts={sampleAlerts} />);

    // Item 1
    expect(html).toContain('NIF mal formé · Jordan B.');
    expect(html).toContain('« 12345 » : 13 chiffres attendus, commençant par 0, 1, 2 ou 3.');

    // Item 2
    expect(html).toContain('Même NIF sur 2 comptes · Sarah K. et Sarah Karim');
    expect(html).toContain('NIF « •••• 012 » utilisé par deux réparateurs.');

    // Item 3
    expect(html).toContain('Même IBAN sur 2 comptes · Lucas D. et Lucas Dubois');
    expect(html).toContain('•••• 7781 utilisé par deux réparateurs.');

    // Item 4
    expect(html).toContain('« Pas de NIF » coché, 41 ans · Karim T.');
    expect(html).toContain('À vérifier : demander un justificatif.');

    // Item 5
    expect(html).toContain('80 % du plafond particulier · Camille Martin');
    expect(html).toContain('8 missions et 1 140 € sur 12 mois.');
  });

  it('renders clickable links pointing to user fiches', () => {
    const html = renderToString(<VerificationAlertsBlock initialAlerts={sampleAlerts} />);

    expect(html).toContain('href="/utilisateurs/usr-jordan-1"');
    expect(html).toContain('href="/utilisateurs/usr-sarah-1"');
    expect(html).toContain('href="/utilisateurs/usr-lucas-1"');
    expect(html).toContain('href="/utilisateurs/usr-karim-1"');
    expect(html).toContain('href="/utilisateurs/usr-camille-1"');
  });

  it('styles critical alerts with red accents and warning alerts with amber accents', () => {
    const html = renderToString(<VerificationAlertsBlock initialAlerts={sampleAlerts} />);

    // Red accent for critical
    expect(html).toContain('background-color:var(--badge-danger-text)');
    expect(html).toContain('background-color:var(--badge-danger-bg)');

    // Amber accent for warning
    expect(html).toContain('background-color:var(--badge-warning-text)');
    expect(html).toContain('background-color:var(--badge-warning-bg)');
  });

  it('renders nothing when alerts list is empty', () => {
    const html = renderToString(<VerificationAlertsBlock initialAlerts={[]} />);
    expect(html).toBe('');
  });
});
