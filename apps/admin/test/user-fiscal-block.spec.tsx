import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminUserFiscalData } from '@revime/shared';
import { UserFiscalBlock } from '../components/UserFiscalBlock';
import { FiscalAuditDrawer } from '../components/FiscalAuditDrawer';

describe('A-1: UserFiscalBlock Component', () => {
  const mockIncompleteFiscal: AdminUserFiscalData = {
    isComplete: false,
    legalName: 'Camille Martin',
    birthDate: '14/03/1995',
    address: '12 rue des Lilas, 69003 Lyon',
    nif: null,
    hasNoNif: true,
    birthCity: null,
    birthCountry: null,
    siret: null,
    vatNumber: null,
    maskedIban: '•••• 0412',
    reminderCount: 1,
    lastReminderAt: '2026-10-03T10:00:00.000Z',
    auditLogs: [
      {
        id: 'log-1',
        fieldName: 'reminder',
        oldValue: null,
        newValue: 'relance_1',
        changedAt: '2026-10-03T10:00:00.000Z',
      },
    ],
  };

  const mockCompleteFiscal: AdminUserFiscalData = {
    isComplete: true,
    legalName: 'Jean Dupont',
    birthDate: '20/06/1988',
    address: '5 avenue Foch, 75016 Paris',
    nif: '0123456789012',
    hasNoNif: false,
    birthCity: 'Paris',
    birthCountry: 'FR',
    siret: '12345678900012',
    vatNumber: 'FR12123456789',
    maskedIban: '•••• 9876',
    reminderCount: 0,
    lastReminderAt: null,
    auditLogs: [],
  };

  it('renders fiscal block header with title and Incomplet badge for incomplete profile', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-1" userName="Camille Martin" fiscal={mockIncompleteFiscal} onRefresh={vi.fn()} />,
    );

    expect(html).toContain('Informations fiscales');
    expect(html).toContain('data-testid="fiscal-status-badge"');
    expect(html).toContain('Incomplet');
  });

  it('renders Complet badge for complete profile', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-2" userName="Jean Dupont" fiscal={mockCompleteFiscal} onRefresh={vi.fn()} />,
    );

    expect(html).toContain('data-testid="fiscal-status-badge"');
    expect(html).toContain('Complet');
  });

  it('shows the name and date of birth as declared, with NO « Stripe Identity » badge: nothing here is verified by Stripe (ISS-052)', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-1" userName="Camille Martin" fiscal={mockIncompleteFiscal} onRefresh={vi.fn()} />,
    );

    expect(html).toContain('Camille Martin');
    expect(html).toContain('14/03/1995');
    expect(html).not.toContain('badge-stripe-identity');
    expect(html).not.toContain('✓ Stripe Identity');
    expect(html).toContain('déclarés par le réparateur');
  });

  it('renders "Non renseigné (case « pas de NIF »)" and Manquant for missing birth place when hasNoNif is true', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-1" userName="Camille Martin" fiscal={mockIncompleteFiscal} onRefresh={vi.fn()} />,
    );

    expect(html).toContain('Non renseigné (case « pas de NIF »)');
    expect(html).toContain('data-testid="badge-missing"');
    expect(html).toContain('Manquant');
  });

  it('renders SIRET / TVA for pro and "— (particulier)" for individual', () => {
    const individualHtml = renderToString(
      <UserFiscalBlock userId="usr-1" userName="Camille Martin" fiscal={mockIncompleteFiscal} onRefresh={vi.fn()} />,
    );
    expect(individualHtml).toContain('— (particulier)');

    const proHtml = renderToString(
      <UserFiscalBlock userId="usr-2" userName="Jean Dupont" fiscal={mockCompleteFiscal} onRefresh={vi.fn()} />,
    );
    expect(proHtml).toContain('12345678900012 / FR12123456789');
  });

  it('renders masked IBAN with (Stripe Connect) label', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-1" userName="Camille Martin" fiscal={mockIncompleteFiscal} onRefresh={vi.fn()} />,
    );
    expect(html).toContain('IBAN (Stripe Connect)');
    expect(html).toContain('•••• 0412');
  });

  it('says « Non renseigné » for an account with no synced bank account, never a made-up IBAN', () => {
    const html = renderToString(
      <UserFiscalBlock
        userId="usr-1"
        userName="Camille Martin"
        fiscal={{ ...mockIncompleteFiscal, maskedIban: null }}
        onRefresh={vi.fn()}
      />,
    );
    expect(html).toContain('IBAN (Stripe Connect)');
    expect(html).toContain('Non renseigné');
    expect(html).not.toContain('FR76');
  });

  it('adheres to Zero Black Buttons: uses Navy (#25324F) for primary reminder button and never pure black', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-1" userName="Camille Martin" fiscal={mockIncompleteFiscal} onRefresh={vi.fn()} />,
    );

    expect(html).toContain('data-testid="fiscal-remind-btn"');
    expect(html).toContain('Relancer pour infos fiscales');
    // Ensure button is styled with Navy #25324F and never #000000 or black
    expect(html).toMatch(/var\(--navy, #25324F\)|#25324F/i);
    expect(html).not.toMatch(/background-color:\s*(#000000|#000|black)/i);
  });

  it('displays reminder count and date subtitle', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-1" userName="Camille Martin" fiscal={mockIncompleteFiscal} onRefresh={vi.fn()} />,
    );

    expect(html).toContain('data-testid="fiscal-reminder-count-label"');
    expect(html).toContain('Relances envoyées : 1');
  });

  it('disables reminder button when profile is complete', () => {
    const html = renderToString(
      <UserFiscalBlock userId="usr-2" userName="Jean Dupont" fiscal={mockCompleteFiscal} onRefresh={vi.fn()} />,
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('Dossier fiscal complet');
  });

  describe('FiscalAuditDrawer', () => {
    it('renders dialog with accessibility attributes and localized field labels when open', () => {
      const logs = [
        ...mockIncompleteFiscal.auditLogs,
        {
          id: 'log-2',
          fieldName: 'declaration',
          oldValue: null,
          newValue: 'initial_submission',
          changedAt: '2026-10-02T10:00:00.000Z',
        },
        {
          id: 'log-3',
          fieldName: 'birthDate',
          oldValue: null,
          newValue: '14/03/1995',
          changedAt: '2026-10-02T10:00:00.000Z',
        },
      ];

      const html = renderToString(
        <FiscalAuditDrawer
          isOpen={true}
          onClose={vi.fn()}
          auditLogs={logs}
          userName="Camille Martin"
        />,
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="fiscal-audit-drawer-title"');
      expect(html).toContain('data-testid="fiscal-audit-drawer-close-btn"');
      expect(html).toContain('Historique des modifications fiscales');
      expect(html).toContain('Relance fiscale envoyée');
      expect(html).toContain('Déclaration fiscale');
      expect(html).toContain('Soumission initiale de la déclaration');
      expect(html).toContain('Date de naissance');
      expect(html).toContain('data-testid="fiscal-audit-log-item"');
    });

    it('renders empty placeholder when no audit logs exist', () => {
      const html = renderToString(
        <FiscalAuditDrawer
          isOpen={true}
          onClose={vi.fn()}
          auditLogs={[]}
          userName="Jean Dupont"
        />,
      );

      expect(html).toContain('data-testid="fiscal-audit-empty"');
      expect(html).toContain('Aucune modification enregistrée dans l&#x27;historique.');
    });

    it('renders nothing when isOpen is false', () => {
      const html = renderToString(
        <FiscalAuditDrawer
          isOpen={false}
          onClose={vi.fn()}
          auditLogs={mockIncompleteFiscal.auditLogs}
          userName="Camille Martin"
        />,
      );

      expect(html).toBe('');
    });

    it('reads the reminder values the server records, the last one included (not « Relance n°2_freeze_warning »)', () => {
      const reminder = (id: string, oldValue: string | null, newValue: string) => ({
        id,
        fieldName: 'reminder',
        oldValue,
        newValue,
        changedAt: '2026-10-05T10:00:00.000Z',
      });
      const html = renderToString(
        <FiscalAuditDrawer
          isOpen={true}
          onClose={vi.fn()}
          auditLogs={[
            reminder('r2', 'relance_1', 'relance_2_freeze_warning'),
            reminder('r3', 'relance_2_freeze_warning', 'relance_3'),
          ]}
          userName="Camille Martin"
        />,
      );

      expect(html).toContain('Relance n°1 → Relance n°2 (dernier rappel)');
      expect(html).toContain('Relance n°2 (dernier rappel) → Relance n°3');
      expect(html).not.toContain('freeze_warning');
    });
  });
});
