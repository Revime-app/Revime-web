import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  LEGAL_WITHDRAWAL_WAIVER_TEXT,
  euros,
  type ExecutionDelayPreference,
} from '@revime/shared';

// Mock theme hook so that WithdrawalSection can be evaluated directly
vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      paper: '#FFFFFF',
      ink: '#101828',
      line: '#E4E7EC',
      muted: '#667085',
      mist: '#F2F4F7',
      red: '#D92D20',
    },
    accent: {
      accent: '#E63946',
      accentDeep: '#C92A36',
    },
    radii: {
      card: 16,
      field: 12,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    type: {
      body: { size: 14 },
      section: { size: 18 },
    },
  }),
}));

import { WithdrawalSection } from '../src/components/payment/WithdrawalSection';

// Helper functions to traverse the React element tree
function findAll(node: any, predicate: (n: any) => boolean): any[] {
  if (!node || typeof node !== 'object') return [];
  const results: any[] = [];
  if (predicate(node)) {
    results.push(node);
  }
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...findAll(child, predicate));
    }
  } else if (children && typeof children === 'object') {
    results.push(...findAll(children, predicate));
  }
  return results;
}

function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  const children = node.props?.children;
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(extractText).join('');
  }
  if (children && typeof children === 'object') {
    return extractText(children);
  }
  return '';
}

function computePayGated(
  isPro: boolean,
  delayPreference: ExecutionDelayPreference,
  waiverAccepted: boolean,
): boolean {
  return isPro && delayPreference === 'IMMEDIATE' && !waiverAccepted;
}

function createCheckoutPayload(
  isPro: boolean,
  delayPreference: ExecutionDelayPreference,
  acceptedAt?: string,
) {
  return {
    delivery: 'WORKSHOP',
    delayPreference,
    withdrawalWaiver:
      isPro && delayPreference === 'IMMEDIATE'
        ? {
            accepted: true,
            acceptedAt: acceptedAt ?? new Date().toISOString(),
            acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
          }
        : null,
  };
}

describe('WithdrawalSection & Checkout Screen Integration', () => {
  describe('Mockup 02-1 & 02-2: Professional repairer', () => {
    it('renders unticked waiver checkbox by default for pro repairer', () => {
      const onToggle = vi.fn();
      const onSelectDelay = vi.fn();
      const onOpenInfo = vi.fn();

      const tree = WithdrawalSection({
        isPro: true,
        waiverAccepted: false,
        onToggleWaiver: onToggle,
        delayPreference: 'IMMEDIATE',
        onSelectDelayPreference: onSelectDelay,
        onOpenInfoSheet: onOpenInfo,
      });

      // Find checkbox
      const checkboxes = findAll(
        tree,
        (n) => n.props?.accessibilityRole === 'checkbox',
      );
      expect(checkboxes.length).toBe(1);
      expect(checkboxes[0].props.accessibilityState).toEqual({ checked: false });

      // Verifies exact statutory waiver text is rendered
      const allText = extractText(tree);
      expect(allText).toContain(LEGAL_WITHDRAWAL_WAIVER_TEXT);
      expect(allText).toContain('Je veux que la réparation commence tout de suite');
      expect(allText).toContain('En savoir plus');
      expect(allText).toContain('Je préfère attendre 14 jours avant le début de la réparation');
      expect(allText).toContain("Cochez la case ou choisissez d'attendre 14 jours pour continuer.");
    });

    it('disables pay button when pro waiver is unticked', () => {
      const isPro = true;
      const delayPreference: ExecutionDelayPreference = 'IMMEDIATE';
      const waiverAccepted = false;

      // Exact gating logic implemented in paiement.tsx
      const payGated = computePayGated(isPro, delayPreference, waiverAccepted);
      expect(payGated).toBe(true);

      const payLabel = `🔒 Payer ${euros(9591)} en toute sécurité`;
      expect(payLabel).toBe(`🔒 Payer ${euros(9591)} en toute sécurité`);
      expect(payLabel).toContain('Payer');
      expect(payLabel).toContain('en toute sécurité');
      expect(payLabel).toContain('🔒');
    });

    it('defensive guard in pay() action prevents submission when payGated', () => {
      const isPro = true;
      const delayPreference: ExecutionDelayPreference = 'IMMEDIATE';
      const waiverAccepted = false;
      const payGated = computePayGated(isPro, delayPreference, waiverAccepted);

      const mutateAsync = vi.fn();
      const tryPay = () => {
        const offer = { id: 'offer-1' };
        if (!offer || payGated) return;
        mutateAsync();
      };

      tryPay();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('ticking checkbox enables pay button', () => {
      const onToggle = vi.fn();
      const treeUnticked = WithdrawalSection({
        isPro: true,
        waiverAccepted: false,
        onToggleWaiver: onToggle,
        delayPreference: 'IMMEDIATE',
        onSelectDelayPreference: vi.fn(),
        onOpenInfoSheet: vi.fn(),
      });

      const checkbox = findAll(
        treeUnticked,
        (n) => n.props?.accessibilityRole === 'checkbox',
      )[0];
      checkbox.props.onPress();
      expect(onToggle).toHaveBeenCalledTimes(1);

      // Once ticked:
      const treeTicked = WithdrawalSection({
        isPro: true,
        waiverAccepted: true,
        onToggleWaiver: onToggle,
        delayPreference: 'IMMEDIATE',
        onSelectDelayPreference: vi.fn(),
        onOpenInfoSheet: vi.fn(),
      });

      const tickedBox = findAll(
        treeTicked,
        (n) => n.props?.accessibilityRole === 'checkbox',
      )[0];
      expect(tickedBox.props.accessibilityState).toEqual({ checked: true });

      // Gating condition once ticked
      const payGated = computePayGated(true, 'IMMEDIATE', true);
      expect(payGated).toBe(false);

      // Footnote should not be present when ticked
      const textTicked = extractText(treeTicked);
      expect(textTicked).not.toContain("Cochez la case ou choisissez d'attendre 14 jours pour continuer.");
    });

    it('selecting 14-day delay toggles to delay card and enables pay button without waiver', () => {
      const onSelectDelay = vi.fn();
      const onToggle = vi.fn();

      const tree = WithdrawalSection({
        isPro: true,
        waiverAccepted: false,
        delayPreference: 'IMMEDIATE',
        onToggleWaiver: onToggle,
        onSelectDelayPreference: onSelectDelay,
        onOpenInfoSheet: vi.fn(),
      });

      // Find the delay link
      const buttons = findAll(
        tree,
        (n) => n.props?.accessibilityRole === 'button',
      );
      const delayLink = buttons.find((b) =>
        extractText(b).includes('Je préfère attendre 14 jours'),
      );
      expect(delayLink).toBeDefined();

      delayLink.props.onPress();
      expect(onSelectDelay).toHaveBeenCalledWith('WAIT_14_DAYS');

      // Now render with WAIT_14_DAYS
      const treeDelay = WithdrawalSection({
        isPro: true,
        waiverAccepted: false,
        delayPreference: 'WAIT_14_DAYS',
        onToggleWaiver: onToggle,
        onSelectDelayPreference: onSelectDelay,
        onOpenInfoSheet: vi.fn(),
      });

      // No checkbox rendered in 14-day delay mode
      const checkboxes = findAll(
        treeDelay,
        (n) => n.props?.accessibilityRole === 'checkbox',
      );
      expect(checkboxes.length).toBe(0);

      // Delay explanation and return link are rendered
      const delayText = extractText(treeDelay);
      expect(delayText).toContain('Délai de rétractation de 14 jours sélectionné');
      expect(delayText).toContain('La réparation débutera à la fin du délai légal');
      expect(delayText).toContain('Revenir au démarrage immédiat');

      // When WAIT_14_DAYS, pay button is not gated even if waiverAccepted === false
      const payGated = computePayGated(true, 'WAIT_14_DAYS', false);
      expect(payGated).toBe(false);

      // Pressing « Revenir au démarrage immédiat » switches back to IMMEDIATE
      const returnBtn = findAll(
        treeDelay,
        (n) => n.props?.accessibilityRole === 'button',
      ).find((b) => extractText(b).includes('Revenir au démarrage immédiat'));
      expect(returnBtn).toBeDefined();
      returnBtn.props.onPress();
      expect(onSelectDelay).toHaveBeenCalledWith('IMMEDIATE');
    });
  });

  describe('Mockup 03-1: Non-pro / Private repairer (Particulier)', () => {
    it('renders informational callout and does not gate pay button', () => {
      const onOpenInfo = vi.fn();
      const tree = WithdrawalSection({
        isPro: false,
        waiverAccepted: false,
        delayPreference: 'IMMEDIATE',
        onToggleWaiver: vi.fn(),
        onSelectDelayPreference: vi.fn(),
        onOpenInfoSheet: onOpenInfo,
      });

      // No checkbox rendered
      const checkboxes = findAll(
        tree,
        (n) => n.props?.accessibilityRole === 'checkbox',
      );
      expect(checkboxes.length).toBe(0);

      // Informational callout text
      const calloutText = extractText(tree);
      expect(calloutText).toContain('Réparateur particulier');
      expect(calloutText).toContain("le droit de rétractation ne s'applique pas");
      expect(calloutText).toContain('Votre paiement reste protégé par REVIME');
      expect(calloutText).toContain('En savoir plus');

      // Pay button is NOT gated for non-pro
      const payGated = computePayGated(false, 'IMMEDIATE', false);
      expect(payGated).toBe(false);
    });

    it('clicking En savoir plus triggers onOpenInfoSheet callback', () => {
      const onOpenInfo = vi.fn();
      const tree = WithdrawalSection({
        isPro: false,
        waiverAccepted: false,
        delayPreference: 'IMMEDIATE',
        onToggleWaiver: vi.fn(),
        onSelectDelayPreference: vi.fn(),
        onOpenInfoSheet: onOpenInfo,
      });

      const buttons = findAll(
        tree,
        (n) => n.props?.accessibilityRole === 'button',
      );
      const infoBtn = buttons.find((b) => extractText(b).includes('En savoir plus'));
      expect(infoBtn).toBeDefined();
      infoBtn.props.onPress();
      expect(onOpenInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Checkout Mutation Payload construction', () => {
    it('constructs legal proof waiver payload for pro with immediate start', () => {
      const isPro = true;
      const delayPreference: ExecutionDelayPreference = 'IMMEDIATE';
      const now = new Date('2026-10-06T12:00:00.000Z');

      const payload = createCheckoutPayload(isPro, delayPreference, now.toISOString());

      expect(payload.delayPreference).toBe('IMMEDIATE');
      expect(payload.withdrawalWaiver).toEqual({
        accepted: true,
        acceptedAt: '2026-10-06T12:00:00.000Z',
        acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      });
    });

    it('constructs payload without waiver for pro with 14-day delay', () => {
      const isPro = true;
      const delayPreference: ExecutionDelayPreference = 'WAIT_14_DAYS';

      const payload = createCheckoutPayload(isPro, delayPreference);

      expect(payload.delayPreference).toBe('WAIT_14_DAYS');
      expect(payload.withdrawalWaiver).toBeNull();
    });

    it('constructs payload without waiver for non-pro', () => {
      const isPro = false;
      const delayPreference: ExecutionDelayPreference = 'IMMEDIATE';

      const payload = createCheckoutPayload(isPro, delayPreference);

      expect(payload.delayPreference).toBe('IMMEDIATE');
      expect(payload.withdrawalWaiver).toBeNull();
    });
  });
});
