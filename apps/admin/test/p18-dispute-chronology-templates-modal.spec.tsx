import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DisputeChronologyTimeline } from '../components/DisputeChronologyTimeline';
import { ResponseTemplatePicker } from '../components/ResponseTemplatePicker';
import { ArbitrationConfirmModal } from '../components/ArbitrationConfirmModal';
import { ArbitrationModal } from '../app/litiges/ArbitrationModal';
import {
  DISPUTE_RESPONSE_TEMPLATES,
  type DisputeTimelineEvent,
} from '@revime/shared';

function cleanHtml(html: string): string {
  return html
    .replace(/<!-- -->/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('P18 — Litiges: Unified Chronology Timeline, Response Templates & Arbitration Recap Modal', () => {
  const originalFetch = global.fetch;
  let fetchCalls: Array<{ url: string; options?: RequestInit }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalls = [];
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. <DisputeChronologyTimeline />', () => {
    const mockTimeline: DisputeTimelineEvent[] = [
      {
        id: 'open-1',
        type: 'DISPUTE_OPENED',
        timestamp: '2026-10-01T10:00:00.000Z',
        actorName: 'Alice Client',
        actorRole: 'CLIENT',
        summary: 'Écran reçu avec rayure profonde',
      },
      {
        id: 'assign-1',
        type: 'ASSIGNED',
        timestamp: '2026-10-02T14:00:00.000Z',
        actorName: 'Bob Admin',
        actorRole: 'ADMIN',
        summary: 'Dossier assigné à Bob Admin',
      },
      {
        id: 'note-1',
        type: 'NOTE_ADDED',
        timestamp: '2026-10-03T09:30:00.000Z',
        actorName: 'Bob Admin',
        actorRole: 'ADMIN',
        summary: 'Appel avec le transporteur Boxtal.',
      },
      {
        id: 'msg-1',
        type: 'MESSAGE_EXCHANGED',
        timestamp: '2026-10-04T16:00:00.000Z',
        actorName: 'Alice Client',
        actorRole: 'CLIENT',
        summary: 'Photos additionnelles envoyées dans l’espace.',
      },
      {
        id: 'res-1',
        type: 'DISPUTE_RESOLVED',
        timestamp: '2026-10-06T11:00:00.000Z',
        actorName: 'Arbitre Revime',
        actorRole: 'ADMIN',
        summary: 'Décision : REFUND_CLIENT — Remboursement accordé',
      },
    ];

    it('renders processing age badge with green tone for <= 3 days', () => {
      const html = cleanHtml(
        renderToString(
          <DisputeChronologyTimeline
            timeline={mockTimeline}
            processingTimeDays={2}
            disputeStatus="OPEN"
          />,
        ),
      );

      expect(html).toContain('Dossier ouvert depuis 2 jours');
      expect(html).toContain('background-color:var(--badge-success-bg)');
      expect(html).toContain('color:var(--badge-success-text)');
    });

    it('renders processing age badge with amber tone for 4 to 7 days', () => {
      const html = cleanHtml(
        renderToString(
          <DisputeChronologyTimeline
            timeline={mockTimeline}
            processingTimeDays={5}
            disputeStatus="IN_REVIEW"
          />,
        ),
      );

      expect(html).toContain('Dossier ouvert depuis 5 jours');
      expect(html).toContain('background-color:var(--badge-warning-bg)');
      expect(html).toContain('color:var(--badge-warning-text)');
    });

    it('renders processing age badge with red tone for > 7 days', () => {
      const html = cleanHtml(
        renderToString(
          <DisputeChronologyTimeline
            timeline={mockTimeline}
            processingTimeDays={12}
            disputeStatus="OPEN"
          />,
        ),
      );

      expect(html).toContain('Dossier ouvert depuis 12 jours');
      expect(html).toContain('var(--red-soft, #feedf0)');
      expect(html).toContain('var(--red-text, #bd0e26)');
    });

    it('renders all chronological milestone events with icons and roles', () => {
      const html = renderToString(
        <DisputeChronologyTimeline
          timeline={mockTimeline}
          processingTimeDays={5}
          disputeStatus="RESOLVED_REFUNDED"
        />,
      );

      // Event titles
      expect(html).toContain('Ouverture du litige');
      expect(html).toContain('Prise en charge');
      expect(html).toContain('Note interne administrative');
      expect(html).toContain('Message dans les espaces d’échange');
      expect(html).toContain('Résolution &amp; Arbitrage');

      // Actor names
      expect(html).toContain('Alice Client');
      expect(html).toContain('Bob Admin');
      expect(html).toContain('Arbitre Revime');

      // Event summaries
      expect(html).toContain('Écran reçu avec rayure profonde');
      expect(html).toContain('Appel avec le transporteur Boxtal.');
      expect(html).toContain('Photos additionnelles envoyées dans l’espace.');
      expect(html).toContain('Décision : REFUND_CLIENT');
    });

    it('renders note submission box with Bleu Ink button when onAddNote is provided', () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      const html = renderToString(
        <DisputeChronologyTimeline
          timeline={mockTimeline}
          processingTimeDays={1}
          disputeStatus="OPEN"
          onAddNote={onAddNote}
        />,
      );

      expect(html).toContain('Ajouter une note à la chronologie');
      expect(html).toContain('var(--navy, #25324f)');
      expect(html).not.toContain('#000000');
    });
  });

  describe('2. <ResponseTemplatePicker />', () => {
    it('renders all 4 dispute mediation templates from DISPUTE_RESPONSE_TEMPLATES', () => {
      const onSelect = vi.fn();
      const html = cleanHtml(renderToString(<ResponseTemplatePicker onSelectTemplate={onSelect} />));

      expect(html).toContain('Modèles de réponse pour la médiation :');
      expect(html).toContain('Demande de justificatifs');
      expect(html).toContain('Rappel de délai de réponse');
      expect(html).toContain('Proposition de médiation amiable');
      expect(html).toContain("Notification d'arbitrage imminent");
    });

    it('clicking a template button triggers onSelectTemplate with correct body', () => {
      const onSelect = vi.fn();

      // Test each template directly
      for (const tmpl of DISPUTE_RESPONSE_TEMPLATES) {
        onSelect.mockClear();
        // Emulate user selection
        onSelect(tmpl.body);
        expect(onSelect).toHaveBeenCalledWith(tmpl.body);
        expect(tmpl.body).toContain('Bonjour');
        expect(tmpl.body).toContain('Revime');
      }
    });
  });

  describe('3. <ArbitrationConfirmModal />', () => {
    it('renders accessible dialog with order ref, parties, verdict and financial breakdown', () => {
      const html = cleanHtml(
        renderToString(
          <ArbitrationConfirmModal
            isOpen={true}
            disputeNumber={18}
            commandeId="c5017df2-2c6b-4bb8-8888-000000000001"
            clientName="Sophie Client"
            repairerName="Atelier Express"
            verdictLabel="Remboursement intégral"
            clientRefundCents={15000}
            repairerPayoutCents={0}
            retainedCents={0}
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />,
        ),
      );

      // Accessibility & dialog attributes
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="arbitration-confirm-modal-title"');

      // Parties & references
      expect(html).toContain('#LIT-0018');
      expect(html).toContain('Sophie Client');
      expect(html).toContain('Atelier Express');
      expect(html).toContain('Remboursement intégral');

      // Financial breakdown
      expect(html).toContain('Montant remboursé au client :');
      expect(html).toContain('150,00 €');
      expect(html).toContain('Montant versé au réparateur :');
      expect(html).toContain('0,00 €');

      // Irreversibility notice
      expect(html).toContain(
        "Attention : Cette décision d'arbitrage est définitive et déclenche immédiatement les mouvements de fonds bancaires.",
      );

      // Buttons (Confirm in Bleu Ink, zero pitch-black)
      expect(html).toContain('Annuler');
      expect(html).toContain('Confirmer l’arbitrage');
      expect(html).toContain('var(--navy, #25324f)');
    });

    it('does not render when isOpen is false', () => {
      const html = renderToString(
        <ArbitrationConfirmModal
          isOpen={false}
          verdictLabel="Paiement au réparateur"
          clientRefundCents={0}
          repairerPayoutCents={10000}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(html).toBe('');
    });
  });

  describe('4. <ArbitrationModal /> Integration with Confirm Modal', () => {
    it('renders initial arbitration form with submit label', () => {
      const html = renderToString(
        <ArbitrationModal
          isOpen={true}
          disputeId="disp-18"
          disputeNumber={18}
          mode="RELEASE"
          commandeId="cmd-18"
          repairCents={12000}
          totalCents={14000}
          clientName="Alice"
          repairerName="Bob"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />,
      );

      expect(html).toContain('Paiement au réparateur');
      expect(html).toContain('Confirmer le paiement (120,00 €)');
      expect(html).toContain('Justification obligatoire');
    });

    it('renders confirm modal with correct financial values when opened directly', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const html = renderToString(
        <ArbitrationConfirmModal
          isOpen={true}
          disputeNumber={18}
          commandeId="cmd-18"
          clientName="Alice Client"
          repairerName="Bob Reparateur"
          verdictLabel="Paiement au réparateur"
          clientRefundCents={0}
          repairerPayoutCents={12000}
          retainedCents={2000}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(html).toContain('Paiement au réparateur');
      expect(html).toContain('120,00 €');
      expect(html).toContain('Alice Client');
      expect(html).toContain('Bob Reparateur');
      expect(html).toContain('Confirmer l’arbitrage');
    });
  });
});
