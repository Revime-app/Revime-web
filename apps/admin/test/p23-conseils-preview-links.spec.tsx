import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { TipAppPreview } from '../components/TipAppPreview';
import { TipForm } from '../app/conseils/TipForm';
import { ConseilsTable, getTipRotationStatus } from '../app/conseils/page';
import type { AdminTipItem } from '@revime/shared';

function cleanHtml(html: string): string {
  return html
    .replace(/<!-- -->/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('P23: Conseils du jour — Mobile Card Preview, Media/Links & Rotation Status', () => {
  describe('1. <TipAppPreview /> Mobile Preview Component', () => {
    it('renders the app card: bulb glyph, heading and text', () => {
      const html = cleanHtml(
        renderToString(
          <TipAppPreview
            text="Pensez à sauvegarder vos données avant toute intervention."
          />
        )
      );

      expect(html).toContain('data-testid="tip-app-preview"');
      expect(html).toContain('lucide-lightbulb');
      expect(html).toContain('Conseil du jour');
      expect(html).toContain('Pensez à sauvegarder vos données avant toute intervention.');
      // No image or link provided
      expect(html).not.toContain('data-testid="tip-preview-image"');
      expect(html).not.toContain('data-testid="tip-preview-cta"');
    });

    it('prints nothing the app card does not have (no pool pill)', () => {
      const html = cleanHtml(renderToString(<TipAppPreview text="Guide outillage." />));
      expect(html).not.toContain('tip-preview-badge');
      expect(html).not.toContain('Astuce client');
      expect(html).not.toContain('Guide réparateur');
    });

    it('does not draw an address that is not https, as the app does not', () => {
      const html = cleanHtml(
        renderToString(
          <TipAppPreview
            text="Conseil piégé"
            imageUrl="data:image/svg+xml,<svg/>"
            linkUrl="javascript:alert(1)"
          />,
        ),
      );
      expect(html).not.toContain('tip-preview-image');
      expect(html).not.toContain('tip-preview-cta');
      expect(html).not.toContain('javascript:');
    });

    it('does not turn a bare host into a link (the API refuses it, so the preview must not suggest it works)', () => {
      const html = cleanHtml(renderToString(<TipAppPreview text="x" linkUrl="revime.fr/guide" />));
      expect(html).not.toContain('tip-preview-cta');
    });

    it('renders image thumbnail when imageUrl is provided', () => {
      const html = cleanHtml(
        renderToString(
          <TipAppPreview
            text="Conseil avec illustration"
            imageUrl="https://images.unsplash.com/photo-phone-repair.jpg"
          />
        )
      );

      expect(html).toContain('data-testid="tip-preview-image"');
      expect(html).toContain('src="https://images.unsplash.com/photo-phone-repair.jpg"');
      expect(html).toContain('alt="Illustration du conseil"');
    });

    it('renders action CTA button when linkUrl is provided', () => {
      const html = cleanHtml(
        renderToString(
          <TipAppPreview
            text="Consultez notre guide dédié"
            linkUrl="https://repareme.fr/guides/batterie-iphone"
          />
        )
      );

      expect(html).toContain('data-testid="tip-preview-cta"');
      expect(html).toContain('href="https://repareme.fr/guides/batterie-iphone"');
      expect(html).toContain('En savoir plus');
      expect(html).toContain('var(--navy, #25324f)');
    });

    it('updates dynamically when text, image, and link URLs are supplied together', () => {
      const html = cleanHtml(
        renderToString(
          <TipAppPreview
            text="Utilisez un tournevis pentalobe P2 pour ouvrir les iPhone récents sans endommager les vis."
            imageUrl="https://cdn.repareme.fr/tips/pentalobe.jpg"
            linkUrl="https://repareme.fr/outils/pentalobe"
          />
        )
      );

      expect(html).toContain('Utilisez un tournevis pentalobe P2');
      expect(html).toContain('src="https://cdn.repareme.fr/tips/pentalobe.jpg"');
      expect(html).toContain('href="https://repareme.fr/outils/pentalobe"');
      expect(html).toContain('En savoir plus');
    });

    it('renders placeholder notice when text is empty', () => {
      const html = cleanHtml(
        renderToString(<TipAppPreview text="" />)
      );
      expect(html).toContain("Le texte du conseil apparaîtra ici dans l'application mobile…");
    });
  });

  describe('2. <TipForm /> with Media Inputs and Embedded Preview', () => {
    it('renders inputs for Image URL, Action Link URL, and embeds <TipAppPreview />', () => {
      const html = cleanHtml(
        renderToString(
          <TipForm
            tip={null}
            defaultCategory="CLIENT"
            onSaved={() => {}}
            onCancel={() => {}}
          />
        )
      );

      // Saisie texte et formulaire
      expect(html).toContain('Texte du conseil');
      expect(html).toContain('id="tip-text"');

      // Nouveaux champs P23
      expect(html).toContain("Image d'illustration (URL)");
      expect(html).toContain('id="tip-image-url"');
      expect(html).toContain("Lien d'action (URL)");
      expect(html).toContain('id="tip-link-url"');

      // Embedded live mobile preview
      expect(html).toContain('data-testid="tip-app-preview"');
      expect(html).toContain('Aperçu de la carte du jour');

      // Navy button tokens (zero pitch black)
      expect(html).toContain('var(--navy, #25324f)');
    });

    it('pre-fills existing image and link URLs when editing an existing tip', () => {
      const existingTip: AdminTipItem = {
        id: 'tip-42',
        text: 'Astuce existante avec média',
        category: 'CLIENT',
        active: true,
        imageUrl: 'https://cdn.repareme.fr/tips/clean-port.png',
        linkUrl: 'https://repareme.fr/guides/port',
        startsAt: null,
        endsAt: null,
        state: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      const html = cleanHtml(
        renderToString(
          <TipForm
            tip={existingTip}
            defaultCategory="CLIENT"
            onSaved={() => {}}
            onCancel={() => {}}
          />
        )
      );

      expect(html).toContain('Modifier le conseil');
      expect(html).toContain('value="https://cdn.repareme.fr/tips/clean-port.png"');
      expect(html).toContain('value="https://repareme.fr/guides/port"');
      // In-app preview reflects the pre-filled media
      expect(html).toContain('src="https://cdn.repareme.fr/tips/clean-port.png"');
      expect(html).toContain('href="https://repareme.fr/guides/port"');
    });
  });

  describe('3. Rotation and Scheduling Status Badges', () => {
    const baseTip: AdminTipItem = {
      id: 'tip-1',
      text: 'Conseil test',
      category: 'CLIENT',
      active: true,
      imageUrl: null,
      linkUrl: null,
      startsAt: null,
      endsAt: null,
      state: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    it('computes status "Aujourd\'hui" for active daily pick', () => {
      const status = getTipRotationStatus(baseTip, true);
      expect(status.label).toBe("Aujourd'hui");
      expect(status.status).toBe('TODAY');
      expect(status.bg).toBe('var(--badge-success-bg)');
      expect(status.fg).toBe('var(--badge-success-text)');
    });

    it('computes status "En rotation" for active tips not picked today', () => {
      const status = getTipRotationStatus(baseTip, false);
      expect(status.label).toBe('En rotation');
      expect(status.status).toBe('ROTATING');
      expect(status.bg).toBe('var(--badge-info-bg)');
      expect(status.fg).toBe('var(--badge-info-text)');
    });

    it('computes status "Programmé" for scheduled tips', () => {
      const scheduledTip: AdminTipItem = { ...baseTip, state: 'SCHEDULED' };
      const status = getTipRotationStatus(scheduledTip, false);
      expect(status.label).toBe('Programmé');
      expect(status.status).toBe('SCHEDULED');
      expect(status.bg).toBe('var(--badge-info-bg)');
      expect(status.fg).toBe('var(--badge-info-text)');
    });

    it('computes status "Expiré" for expired tips', () => {
      const expiredTip: AdminTipItem = { ...baseTip, state: 'EXPIRED' };
      const status = getTipRotationStatus(expiredTip, false);
      expect(status.label).toBe('Expiré');
      expect(status.status).toBe('EXPIRED');
      expect(status.bg).toBe('var(--badge-neutral-bg)');
      expect(status.fg).toBe('var(--ink2)');
    });

    it('computes status "Désactivé" for disabled tips', () => {
      const disabledTip: AdminTipItem = { ...baseTip, active: false, state: 'DISABLED' };
      const status = getTipRotationStatus(disabledTip, false);
      expect(status.label).toBe('Désactivé');
      expect(status.status).toBe('DISABLED');
      expect(status.bg).toBe('var(--badge-warning-bg)');
      expect(status.fg).toBe('var(--badge-warning-text)');
    });
  });

  describe('4. <ConseilsTable /> List Rendering', () => {
    const mockTips: AdminTipItem[] = [
      {
        id: 'tip-today',
        text: 'Conseil du jour en ligne avec illustration',
        category: 'CLIENT',
        active: true,
        imageUrl: 'https://cdn.repareme.fr/tips/screen.jpg',
        linkUrl: 'https://repareme.fr/guides/ecran',
        startsAt: null,
        endsAt: null,
        state: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'tip-rotating',
        text: 'Conseil actif en rotation',
        category: 'CLIENT',
        active: true,
        imageUrl: null,
        linkUrl: null,
        startsAt: null,
        endsAt: null,
        state: 'ACTIVE',
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'tip-scheduled',
        text: 'Conseil programmé pour les fêtes',
        category: 'CLIENT',
        active: true,
        imageUrl: null,
        linkUrl: null,
        startsAt: '2026-12-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
        state: 'SCHEDULED',
        createdAt: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'tip-expired',
        text: 'Ancien conseil estival',
        category: 'CLIENT',
        active: true,
        imageUrl: null,
        linkUrl: null,
        startsAt: '2026-06-01T00:00:00.000Z',
        endsAt: '2026-08-31T00:00:00.000Z',
        state: 'EXPIRED',
        createdAt: '2026-01-04T00:00:00.000Z',
      },
      {
        id: 'tip-disabled',
        text: 'Conseil temporairement retiré',
        category: 'CLIENT',
        active: false,
        imageUrl: null,
        linkUrl: null,
        startsAt: null,
        endsAt: null,
        state: 'DISABLED',
        createdAt: '2026-01-05T00:00:00.000Z',
      },
    ];

    it('renders all 5 rotation status badges accurately in the list table', () => {
      const html = cleanHtml(
        renderToString(<ConseilsTable items={mockTips} todayId="tip-today" />)
      );

      // Check all 5 badges are rendered
      expect(html).toContain('data-status="TODAY"');
      expect(html).toContain("Aujourd'hui");

      expect(html).toContain('data-status="ROTATING"');
      expect(html).toContain('En rotation');

      expect(html).toContain('data-status="SCHEDULED"');
      expect(html).toContain('Programmé');

      expect(html).toContain('data-status="EXPIRED"');
      expect(html).toContain('Expiré');

      expect(html).toContain('data-status="DISABLED"');
      expect(html).toContain('Désactivé');

      // Check image thumbnail is rendered for tip with imageUrl
      expect(html).toContain('data-testid="tip-row-image"');
      expect(html).toContain('src="https://cdn.repareme.fr/tips/screen.jpg"');

      // Check action link is rendered for tip with linkUrl
      expect(html).toContain('data-testid="tip-row-link"');
      expect(html).toContain('href="https://repareme.fr/guides/ecran"');
    });

    it('never renders a stored non-https address (rows written before the API checked them)', () => {
      const html = cleanHtml(
        renderToString(
          <ConseilsTable
            items={[
              { ...mockTips[0]!, id: 'bad', imageUrl: 'javascript:alert(2)', linkUrl: 'javascript:alert(1)' },
            ]}
            todayId={null}
          />,
        ),
      );
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('data-testid="tip-row-link"');
      expect(html).not.toContain('data-testid="tip-row-image"');
    });

    it('renders empty placeholder message when no tips exist', () => {
      const html = cleanHtml(renderToString(<ConseilsTable items={[]} todayId={null} />));
      expect(html).toContain("Aucun conseil pour l'instant.");
    });
  });
});
