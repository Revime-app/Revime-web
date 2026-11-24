import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ReglagesPage, {
  calculateFeeSimulation,
  canEditSettings,
  updatePlatformSettingsAction,
  DEFAULT_PLATFORM_SETTINGS_ENDPOINT,
  type ReglagesPageProps,
} from '../app/reglages/page';
import { NAV_CATEGORIES, ROUTE_TITLES, LINKS } from '../components/AdminNav';
import type { PlatformSettingsDto } from '@revime/shared';
import * as adminGateModule from '../components/AdminGate';
import * as authClientModule from '../lib/auth-client';

// Mock next/navigation
let mockPathname = '/reglages';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockDefaultSettings: PlatformSettingsDto = {
  id: 'singleton',
  protectionFixedCents: 290,
  protectionRateBp: 450,
  commissionRateBp: 0,
  payoutHoldHours: 48,
  offerValidityHours: 168,
  paymentHoldHours: 2,
  deliveryHomeEnabled: true,
  deliveryWorkshopEnabled: true,
  deliveryParcelEnabled: true,
  carrierMondialRelay: true,
  carrierChronopost: true,
  carrierColissimo: true,
  carrierRelaisColis: true,
  maxInsurableValueCents: 100000,
  cguCurrentVersion: '2026-09-04',
  cguForceReaccept: false,
  legalNoticeVersion: '2026-09-04',
  maintenanceEnabled: false,
  maintenanceMessage: 'Plateforme en cours de maintenance. De retour très prochainement.',
  updatedAt: '2026-10-16T12:00:00.000Z',
  updatedByUserId: 'usr-admin-1',
};

describe('F10: Réglages Plateforme Hub Page (/reglages)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/reglages';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Navigation & Route Wiring', () => {
    it('wires /reglages under category "reglages" in NAV_CATEGORIES', () => {
      const reglagesCategory = NAV_CATEGORIES.find((cat) => cat.id === 'reglages');
      expect(reglagesCategory).toBeDefined();

      const reglagesItem = reglagesCategory?.items.find((item) => item.href === '/reglages');
      expect(reglagesItem).toBeDefined();
      expect(reglagesItem?.label).toBe('Réglages plateforme');
    });

    it('registers /reglages title in ROUTE_TITLES', () => {
      expect(ROUTE_TITLES['/reglages']).toBe('Réglages plateforme');
    });

    it('contains /reglages in flat LINKS array', () => {
      const found = LINKS.find((link) => link.href === '/reglages');
      expect(found).toBeDefined();
      expect(found?.label).toBe('Réglages plateforme');
    });
  });

  describe('2. Page Structure & 5 Card Sections', () => {
    it('renders detail layout, breadcrumbs, and all 5 settings cards', () => {
      const html = renderToString(
        <ReglagesPage
          initialSettings={mockDefaultSettings}
          initialIsSuperAdmin={true}
        />
      );

      // Wrapper .page.page--detail
      expect(html).toContain('page page--detail');

      // Breadcrumbs: Accueil -> Réglages -> Réglages plateforme
      expect(html).toContain('Accueil');
      expect(html).toContain('Réglages');
      expect(html).toContain('Réglages plateforme');
      expect(html).toContain('href="/"');
      expect(html).toContain('href="/parametres"');

      // 5 Card sections
      expect(html).toContain('Tarification &amp; Commissions');
      expect(html).toContain('Délais &amp; Expirations');
      expect(html).toContain('Livraison &amp; Transporteurs');
      expect(html).toContain('CGU &amp; Légal');
      expect(html).toContain('Mode Maintenance');

      // Card 1 fields
      expect(html).toContain('protectionFixedCents');
      expect(html).toContain('protectionRateBp');
      expect(html).toContain('commissionRateBp');
      expect(html).toContain('Simulateur en direct');

      // Card 2 fields
      expect(html).toContain('payoutHoldHours');
      expect(html).toContain('offerValidityHours');
      expect(html).toContain('paymentHoldHours');

      // Card 3 delivery & carrier toggles
      expect(html).toContain('deliveryHomeEnabled');
      expect(html).toContain('deliveryWorkshopEnabled');
      expect(html).toContain('deliveryParcelEnabled');
      expect(html).toContain('carrierMondialRelay');
      expect(html).toContain('carrierChronopost');
      expect(html).toContain('carrierColissimo');
      expect(html).toContain('carrierRelaisColis');
      expect(html).toContain('maxInsurableValueCents');

      // Card 4 legal fields
      expect(html).toContain('cguCurrentVersion');
      expect(html).toContain('cguForceReaccept');
      expect(html).toContain('legalNoticeVersion');

      // Card 5 maintenance fields
      expect(html).toContain('maintenanceEnabled');
      expect(html).toContain('maintenanceMessage');
    });
  });

  describe('3. Live Fee Calculation Simulator', () => {
    it('computes exact simulation values for default settings on 100,00 € repair', () => {
      // 290 cents fixed = 2,90 €, 450 bp rate = 4,50 €, 0 bp commission = 0,00 €
      const sim = calculateFeeSimulation(290, 450, 0, 100);

      expect(sim.fixedEuros).toBe(2.9);
      expect(sim.variableEuros).toBe(4.5);
      expect(sim.protectionTotalEuros).toBe(7.4);
      expect(sim.totalClientEuros).toBe(107.4);
      expect(sim.commissionEuros).toBe(0);

      // French formatted strings
      expect(sim.fixedEurosFormatted).toMatch(/2[,\.]90\s*€/);
      expect(sim.variableEurosFormatted).toMatch(/4[,\.]50\s*€/);
      expect(sim.protectionTotalFormatted).toMatch(/7[,\.]40\s*€/);
      expect(sim.totalClientFormatted).toMatch(/107[,\.]40\s*€/);
      expect(sim.commissionFormatted).toMatch(/0[,\.]00\s*€/);
    });

    it('dynamically recalculates simulation when parameters change', () => {
      // Custom: fixed 500 cents (5,00 €), rate 600 bp (6,00 %), commission 1000 bp (10,00 %)
      const sim = calculateFeeSimulation(500, 600, 1000, 100);

      expect(sim.fixedEuros).toBe(5.0);
      expect(sim.variableEuros).toBe(6.0);
      expect(sim.protectionTotalEuros).toBe(11.0);
      expect(sim.totalClientEuros).toBe(111.0);
      expect(sim.commissionEuros).toBe(10.0);

      expect(sim.fixedEurosFormatted).toMatch(/5[,\.]00\s*€/);
      expect(sim.variableEurosFormatted).toMatch(/6[,\.]00\s*€/);
      expect(sim.protectionTotalFormatted).toMatch(/11[,\.]00\s*€/);
      expect(sim.totalClientFormatted).toMatch(/111[,\.]00\s*€/);
      expect(sim.commissionFormatted).toMatch(/10[,\.]00\s*€/);
    });

    it('renders simulation preview in rendered HTML with formula structure', () => {
      const html = renderToString(
        <ReglagesPage
          initialSettings={mockDefaultSettings}
          initialIsSuperAdmin={true}
        />
      );

      expect(html).toContain('data-testid="live-simulator"');
      expect(html).toContain('Frais fixes:');
      expect(html).toContain('Variable:');
      expect(html).toContain('Protection:');
      expect(html).toContain('Total client:');
      expect(html).toContain('Commission réparateur:');
    });
  });

  describe('4. Role-Aware RBAC Lockdown & Consultation Mode', () => {
    it('when user is super_admin: inputs are interactive and save button is enabled', () => {
      const html = renderToString(
        <ReglagesPage
          initialSettings={mockDefaultSettings}
          initialIsSuperAdmin={true}
        />
      );

      // Consultation warning must NOT be shown
      expect(html).not.toContain(
        'Mode consultation — Seuls les super administrateurs peuvent modifier ces réglages.'
      );

      // Save button must be present with Bleu Ink style
      expect(html).toContain('Enregistrer les modifications');
      expect(html).toContain('var(--navy, #25324f)');

      // Reset button must be present
      expect(html).toContain('Réinitialiser');

      // Key input must not be disabled
      expect(html).toMatch(/<input[^>]*name="protectionFixedCents"[^>]*>/);
      const inputMatch = html.match(/<input[^>]*name="protectionFixedCents"[^>]*>/);
      expect(inputMatch?.[0]).not.toContain('disabled');
    });

    it('when user is NOT super_admin (admin, finance, etc.): fields are disabled and warning banner is shown', () => {
      const rolesToTest = ['admin', 'finance', 'moderation', 'support', 'read_only'];

      for (const _role of rolesToTest) {
        const html = renderToString(
          <ReglagesPage
            initialSettings={mockDefaultSettings}
            initialIsSuperAdmin={false}
          />
        );

        // Warning banner must be present
        expect(html).toContain(
          'Mode consultation — Seuls les super administrateurs peuvent modifier ces réglages.'
        );

        // Inputs must be disabled
        const fixedInputMatch = html.match(/<input[^>]*name="protectionFixedCents"[^>]*>/);
        expect(fixedInputMatch?.[0]).toContain('disabled');

        const hoursInputMatch = html.match(/<input[^>]*name="payoutHoldHours"[^>]*>/);
        expect(hoursInputMatch?.[0]).toContain('disabled');

        const cguInputMatch = html.match(/<select[^>]*name="cguCurrentVersion"[^>]*>/);
        expect(cguInputMatch?.[0]).toContain('disabled');

        // Save submit button is either disabled or omitted
        if (html.includes('Enregistrer les modifications')) {
          const buttonMatch = html.match(/<button[^>]*>[\s\S]*?Enregistrer les modifications[\s\S]*?<\/button>/);
          expect(buttonMatch?.[0]).toContain('disabled');
        }
      }
    });

    it('says that the stored values are not applied yet, to a super admin and to a reader alike', () => {
      for (const initialIsSuperAdmin of [true, false]) {
        const html = renderToString(
          <ReglagesPage initialSettings={mockDefaultSettings} initialIsSuperAdmin={initialIsSuperAdmin} />
        );
        expect(html).toContain('Valeurs enregistrées, pas encore appliquées');
      }
    });

    it('V7 D5 (U9, Q7): maintenance leaves the « pas encore appliquées » list, and its card says what clients see', () => {
      const html = renderToString(<ReglagesPage initialSettings={mockDefaultSettings} initialIsSuperAdmin={true} />);
      const banner = html.match(/Valeurs enregistrées, pas encore appliquées[^<]*/)?.[0] ?? '';
      expect(banner).toContain('les frais, les délais et les transporteurs');
      expect(banner).not.toContain('maintenance');
      expect(html).toContain(
        'Quand il est actif, l’application affiche à tous les utilisateurs un écran « Maintenance en cours » avec ce message ; les comptes de l’équipe gardent l’accès.',
      );
      expect(html).toContain('Les versions de l’application antérieures à cette fonctionnalité ne l’affichent pas.');
    });

    it('locks the form after a failed load, even for a super admin (it would save the defaults)', () => {
      expect(canEditSettings(true, false)).toBe(true);
      expect(canEditSettings(true, true)).toBe(false);
      expect(canEditSettings(false, false)).toBe(false);
      expect(canEditSettings(false, true)).toBe(false);
    });

    it('renders warning alert badge when maintenance mode is active', () => {
      const htmlMaintenanceActive = renderToString(
        <ReglagesPage
          initialSettings={{
            ...mockDefaultSettings,
            maintenanceEnabled: true,
          }}
          initialIsSuperAdmin={true}
        />
      );

      expect(htmlMaintenanceActive).toContain('data-testid="maintenance-badge"');
      expect(htmlMaintenanceActive).toContain('Mode maintenance actif');
    });
  });

  describe('5. Save Mutation Action Dispatch & Proxy Endpoint', () => {
    it('uses /api/proxy/admin/settings as default API endpoint', () => {
      expect(DEFAULT_PLATFORM_SETTINGS_ENDPOINT).toBe('/api/proxy/admin/settings');
    });

    it('dispatches PATCH to proxy endpoint by default with form payload', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...mockDefaultSettings, protectionFixedCents: 350 }),
      });

      const payload = {
        protectionFixedCents: 350,
        protectionRateBp: 450,
        commissionRateBp: 0,
      };

      const result = await updatePlatformSettingsAction(
        payload,
        DEFAULT_PLATFORM_SETTINGS_ENDPOINT,
        fetchSpy as any
      );

      expect(fetchSpy).toHaveBeenCalledWith('/api/proxy/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      expect(result.ok).toBe(true);
      expect(result.data?.protectionFixedCents).toBe(350);
    });

    it('supports custom apiEndpoint prop override on updatePlatformSettingsAction', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...mockDefaultSettings, protectionFixedCents: 400 }),
      });

      const payload = { protectionFixedCents: 400 };
      await updatePlatformSettingsAction(payload, '/api/custom/settings', fetchSpy as any);

      expect(fetchSpy).toHaveBeenCalledWith('/api/custom/settings', expect.anything());
    });

    it('renders loading state when initialSettings is omitted', () => {
      const html = renderToString(
        <ReglagesPage
          initialSettings={null}
          initialIsSuperAdmin={true}
        />
      );
      expect(html).toContain('data-testid="settings-loading"');
      expect(html).toContain('Chargement des réglages');
    });

    it('skips loading state when initialSettings is provided', () => {
      const html = renderToString(
        <ReglagesPage
          initialSettings={mockDefaultSettings}
          initialIsSuperAdmin={true}
        />
      );
      expect(html).not.toContain('data-testid="settings-loading"');
    });

    it('renders submit button with type="submit" and text "Enregistrer les modifications"', () => {
      const html = renderToString(
        <ReglagesPage
          initialSettings={mockDefaultSettings}
          initialIsSuperAdmin={true}
        />
      );
      expect(html).toContain('type="submit"');
      expect(html).toContain('Enregistrer les modifications');
    });
  });

  describe('6. Automated ZERO BLACK BUTTONS Scanner', () => {
    it('verifies that no button, badge, or interactive control uses black styling', () => {
      const views = [
        // 1. Super Admin View
        renderToString(
          <ReglagesPage
            initialSettings={mockDefaultSettings}
            initialIsSuperAdmin={true}
          />
        ),
        // 2. Read-Only Consultation View
        renderToString(
          <ReglagesPage
            initialSettings={mockDefaultSettings}
            initialIsSuperAdmin={false}
          />
        ),
        // 3. Maintenance Enabled View
        renderToString(
          <ReglagesPage
            initialSettings={{
              ...mockDefaultSettings,
              maintenanceEnabled: true,
            }}
            initialIsSuperAdmin={true}
          />
        ),
      ];

      for (const html of views) {
        // Scan all buttons
        const buttonRegex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
        let match: RegExpExecArray | null;
        while ((match = buttonRegex.exec(html)) !== null) {
          const buttonAttrs = match[1];

          // Check inline style
          const styleMatch = buttonAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            expect(style).not.toMatch(
              /background(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
            expect(style).not.toMatch(
              /border(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
            expect(style).not.toMatch(
              /color\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
          }

          // Check class
          const classMatch = buttonAttrs.match(/class="([^"]*)"/i);
          if (classMatch) {
            const className = classMatch[1].toLowerCase();
            expect(className).not.toContain('black');
          }
        }

        // Scan badges / pills / spans
        const spanRegex = /<span\s+([^>]*?)>([\s\S]*?)<\/span>/gi;
        while ((match = spanRegex.exec(html)) !== null) {
          const spanAttrs = match[1];
          const styleMatch = spanAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            expect(style).not.toMatch(
              /background(-color)?\s*:\s*(#000000|#000\b|black\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
          }
        }
      }
    });
  });
});
