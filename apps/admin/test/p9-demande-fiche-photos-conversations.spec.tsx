import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { AdminDemandeConversationThread, AdminDemandeDetail, CategoryDto } from '@revime/shared';
import {
  DemandeConversations,
  formatFrenchDateTime,
} from '../components/DemandeConversations';
import { DemandeActionForms } from '../components/DemandeActionForms';
import { DemandeDetailView } from '../app/demandes/[id]/DemandeDetailView';

describe('P9: Fiche Demande — Photos Gallery, Conversations & Grouped Categories', () => {
  describe('Photos Gallery & Empty State', () => {
    const base: AdminDemandeDetail = {
      demandeId: 'demande-1',
      title: 'iPhone 13 écran fissuré',
      description: 'Tombé par terre',
      brand: 'Apple',
      model: 'iPhone 13',
      parts: 'ORIGINAL',
      mode: 'OFFERS',
      budgetCents: null,
      locationLabel: 'Paris',
      postalCode: '75001',
      status: 'OPEN',
      categoryId: 'cat-sub-1',
      categoryLabelFr: 'Smartphones',
      state: 'visible',
      removalReason: null,
      removedByAdmin: false,
      author: { userId: 'u-1', name: 'Jean Dupont', email: 'jean@example.com' },
      photoUrls: [],
      paymentInFlight: false,
      offers: [],
      commandes: [],
      activity: [],
      conversations: [],
      quoteTarget: null,
      quoteClosedReason: null,
      createdAt: '2026-10-16T12:00:00Z',
    };

    it('renders the empty state placeholder when no photos are attached', () => {
      const html = renderToString(<DemandeDetailView demande={base} />);

      expect(html).toContain('data-testid="demande-photos-empty"');
      expect(html).toContain('Aucune photo jointe à cette demande');
      expect(html).not.toContain('data-testid="demande-photos-gallery"');
    });

    it('renders one clickable thumbnail per photo of the real fiche', () => {
      const photoUrls = [
        'https://storage.example.com/photos/screen-front.jpg',
        'https://storage.example.com/photos/screen-back.jpg',
      ];
      const html = renderToString(<DemandeDetailView demande={{ ...base, photoUrls }} />);

      expect(html).toContain('data-testid="demande-photos-gallery"');
      expect(html).not.toContain('Aucune photo jointe à cette demande');
      expect(html).toContain('data-testid="demande-photo-0"');
      expect(html).toContain('data-testid="demande-photo-1"');
      expect(html).toContain(photoUrls[0]);
      expect(html).toContain(photoUrls[1]);
      expect(html).toContain('target="_blank"');
    });
  });

  describe('DemandeConversations Component', () => {
    it('renders informative empty state when conversations array is empty or undefined', () => {
      const htmlEmpty = renderToString(<DemandeConversations conversations={[]} />);
      expect(htmlEmpty).toContain('data-testid="demande-conversations-empty"');
      expect(htmlEmpty).toContain('Aucun échange de messagerie pour cette demande');

      const htmlUndefined = renderToString(<DemandeConversations conversations={undefined} />);
      expect(htmlUndefined).toContain('data-testid="demande-conversations-empty"');
      expect(htmlUndefined).toContain('Aucun échange de messagerie pour cette demande');
    });

    it('renders speech bubbles, sender badges and French timestamps for single thread', () => {
      const conversations: AdminDemandeConversationThread[] = [
        {
          id: 'thread-1',
          repairerId: 'rep-1',
          repairerName: 'Atelier Phone Express',
          messages: [
            {
              id: 'm1',
              senderRole: 'CLIENT',
              content: 'Bonjour, mon écran tactile ne répond plus du tout.',
              createdAt: '2026-10-14T14:32:00.000Z', deleted: false
            },
            {
              id: 'm2',
              senderRole: 'REPAIRER',
              content: 'Bonjour ! Avez-vous tenté un redémarrage forcé ?',
              createdAt: '2026-10-14T14:45:00.000Z', deleted: false
            },
          ],
        },
      ];

      const html = renderToString(<DemandeConversations conversations={conversations} />);

      expect(html).toContain('Messagerie');
      expect(html).not.toContain('role="tablist"'); // Only 1 thread, no tabs needed
      expect(html).toContain('data-testid="message-bubble-m1"');
      expect(html).toContain('data-testid="message-bubble-m2"');

      // Sender Badges
      expect(html).toContain('Client');
      expect(html).toContain('Réparateur · Atelier Phone Express');

      // Message content preserved
      expect(html).toContain('Bonjour, mon écran tactile ne répond plus du tout.');
      expect(html).toContain('Bonjour ! Avez-vous tenté un redémarrage forcé ?');

      // Styling: Client neutral (#f8f9fa), Repairer brand-tinted (#edf3fc)
      expect(html).toContain('var(--badge-neutral-bg)');
      expect(html).toContain('var(--badge-info-bg)');

      // French timestamp formatting
      const formattedTimestamp = formatFrenchDateTime('2026-10-14T14:32:00.000Z');
      expect(formattedTimestamp).toMatch(/14 oct\. 2026 à \d{2}:\d{2}/);
      expect(html).toContain(formattedTimestamp);
    });

    it('renders multi-repairer thread selection tabs with badge count and allows thread switching', () => {
      const conversations: AdminDemandeConversationThread[] = [
        {
          id: 'thread-1',
          repairerId: 'rep-1',
          repairerName: 'Atelier Phone Express',
          messages: [
            {
              id: 'm1',
              senderRole: 'CLIENT',
              content: 'Question pour atelier 1',
              createdAt: '2026-10-14T10:00:00.000Z', deleted: false
            },
          ],
        },
        {
          id: 'thread-2',
          repairerId: 'rep-2',
          repairerName: 'Docteur Mobile',
          messages: [
            {
              id: 'm2',
              senderRole: 'REPAIRER',
              content: 'Proposition de Docteur Mobile',
              createdAt: '2026-10-14T11:00:00.000Z', deleted: false
            },
            {
              id: 'm3',
              senderRole: 'CLIENT',
              content: 'Merci pour votre offre',
              createdAt: '2026-10-14T11:15:00.000Z', deleted: false
            },
          ],
        },
      ];

      // Thread 1 active by default
      const html1 = renderToString(<DemandeConversations conversations={conversations} />);
      expect(html1).toContain('role="tablist"');
      expect(html1).toContain('Atelier Phone Express');
      expect(html1).toContain('Docteur Mobile');
      expect(html1).toContain('2 fils de discussion');
      expect(html1).toContain('Question pour atelier 1');
      expect(html1).not.toContain('Proposition de Docteur Mobile');

      // Thread 2 active via initialThreadId
      const html2 = renderToString(
        <DemandeConversations conversations={conversations} initialThreadId="thread-2" />
      );
      expect(html2).toContain('Proposition de Docteur Mobile');
      expect(html2).toContain('Merci pour votre offre');
      expect(html2).not.toContain('Question pour atelier 1');
    });

    it('renders empty message state within thread when thread has no messages', () => {
      const conversations: AdminDemandeConversationThread[] = [
        {
          id: 'thread-empty',
          repairerId: 'rep-empty',
          repairerName: 'Réparateur Silencieux',
          messages: [],
        },
      ];

      const html = renderToString(<DemandeConversations conversations={conversations} />);
      expect(html).toContain('Aucun message dans cette conversation');
    });
  });

  describe('DemandeActionForms Category Changer', () => {
    const act = vi.fn();

    const sampleCategories: CategoryDto[] = [
      {
        id: 'cat-tel',
        labelFr: 'Téléphonie',
        slug: 'telephonie',
        parentId: null,
      },
      {
        id: 'cat-smartphones',
        labelFr: 'Smartphones',
        slug: 'smartphones',
        parentId: 'cat-tel',
      },
      {
        id: 'cat-tablettes',
        labelFr: 'Tablettes',
        slug: 'tablettes',
        parentId: 'cat-tel',
      },
      {
        id: 'cat-informatique',
        labelFr: 'Informatique',
        slug: 'informatique',
        parentId: null,
      },
      {
        id: 'cat-pc',
        labelFr: 'PC Portables',
        slug: 'pc-portables',
        parentId: 'cat-informatique',
      },
    ];

    it('groups child categories under their parent category with optgroup', () => {
      const html = renderToString(
        <DemandeActionForms
          id="demande-1"
          categoryId="cat-smartphones"
          state="visible"
          paymentInFlight={false}
          busy={false}
          act={act}
          initialCategories={sampleCategories}
        />
      );

      // Asserts <optgroup label="Téléphonie"> is rendered
      expect(html).toContain('<optgroup label="Téléphonie">');
      expect(html).toContain('value="cat-tel"');
      expect(html).toContain('Téléphonie</option>');
      expect(html).toContain('value="cat-smartphones"');
      expect(html).toContain('Smartphones</option>');
      expect(html).toContain('value="cat-tablettes"');
      expect(html).toContain('Tablettes</option>');

      // Asserts <optgroup label="Informatique"> is rendered
      expect(html).toContain('<optgroup label="Informatique">');
      expect(html).toContain('value="cat-informatique"');
      expect(html).toContain('Informatique</option>');
      expect(html).toContain('value="cat-pc"');
      expect(html).toContain('PC Portables</option>');
    });
  });

  describe('SYSTEM and moderated messages', () => {
    it('labels a SYSTEM line as the system and marks a moderated message', () => {
      const conversations: AdminDemandeConversationThread[] = [
        {
          id: 't1',
          repairerId: 'r1',
          repairerName: 'Atelier Phone Express',
          messages: [
            { id: 'sys', senderRole: 'SYSTEM', content: 'Paiement effectué', createdAt: '2026-10-14T10:00:00Z', deleted: false },
            { id: 'del', senderRole: 'REPAIRER', content: 'Retiré', createdAt: '2026-10-14T10:05:00Z', deleted: true },
          ],
        },
      ];

      const html = renderToString(<DemandeConversations conversations={conversations} />);

      expect(html).toContain('Système');
      expect(html.split('Réparateur · Atelier Phone Express').length - 1).toBe(1);
      expect(html).toContain('data-testid="message-deleted-del"');
      expect(html).not.toContain('data-testid="message-deleted-sys"');
    });
  });

  describe('Design Tokens & Global Constraints', () => {
    it('uses var(--navy, #25324f) for primary tabs and zero black buttons in DemandeConversations', () => {
      const conversations: AdminDemandeConversationThread[] = [
        {
          id: 't1',
          repairerId: 'r1',
          repairerName: 'Rep 1',
          messages: [{ id: 'm1', senderRole: 'CLIENT', content: 'Hi', createdAt: '2026-10-14T10:00:00Z', deleted: false }],
        },
        {
          id: 't2',
          repairerId: 'r2',
          repairerName: 'Rep 2',
          messages: [{ id: 'm2', senderRole: 'REPAIRER', content: 'Hello', createdAt: '2026-10-14T10:05:00Z', deleted: false }],
        },
      ];

      const html = renderToString(<DemandeConversations conversations={conversations} />);

      // Surface & borders tokens
      expect(html).toContain('var(--navy, #25324f)');
      expect(html).toContain('var(--paper, #ffffff)');
      expect(html).toContain('var(--line, #dfe2e2)');

      // Zero pitch black buttons
      expect(html).not.toContain('#000000');
      expect(html).not.toContain('#141414');
    });
  });
});
