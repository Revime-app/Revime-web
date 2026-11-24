import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// The REAL design tokens, not a typed copy: a test that restates the hex values it asserts would
// keep passing after the palette changed.
vi.mock('../src/theme', async () => {
  const tokens = await vi.importActual<typeof import('@revime/tokens')>('@revime/tokens');
  return {
    useTheme: () => ({
      palette: tokens.palette,
      accent: tokens.accents.client,
      radii: tokens.radii,
      spacing: tokens.spacing,
    }),
  };
});

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: any) => React.createElement('SafeAreaView', { style }, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { palette } from '@revime/tokens';
import { EscrowSecurityCard } from '../src/components/payment/EscrowSecurityCard';
import { ProtectionSheet } from '../src/components/ProtectionSheet';
import { WithdrawalSection } from '../src/components/payment/WithdrawalSection';
import { buildPaymentSheetParams } from '../src/components/payment/payment-params';

function flattenStyle(style: any): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style;
}

function findNode(node: any, predicate: (n: any) => boolean): any | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  return findNode(node.props?.children, predicate);
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(bl!);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('CF6-06: payment UI is brand blue, not black', () => {
  describe('EscrowSecurityCard', () => {
    it('is filled with the brand navy, not ink', () => {
      const cardStyle = flattenStyle(EscrowSecurityCard({}).props.style);
      expect(cardStyle.backgroundColor).toBe(palette.navy);
      expect(cardStyle.backgroundColor).not.toBe(palette.ink);
    });

    it('keeps its title and copy at AAA contrast (7:1) on that navy', () => {
      const element = EscrowSecurityCard({});
      const title = findNode(element, (n) => typeof n.props?.children === 'string' && n.props.children.includes('Votre argent est protégé'));
      const copy = findNode(element, (n) => typeof n.props?.children === 'string' && n.props.children.includes('REVIME'));
      expect(title).not.toBeNull();
      expect(copy).not.toBeNull();

      expect(contrast(flattenStyle(title.props.style).color, palette.navy)).toBeGreaterThanOrEqual(7);
      expect(contrast(flattenStyle(copy.props.style).color, palette.navy)).toBeGreaterThanOrEqual(7);
    });
  });

  describe('ProtectionSheet', () => {
    it('has a navy header band, not ink', () => {
      const element = ProtectionSheet({ visible: true, onDismiss: () => {}, protectionCents: 290 });
      const band = findNode(element, (n) => {
        const s = flattenStyle(n.props?.style);
        return s.flexDirection === 'row' && s.gap === 12 && s.padding === 16;
      });
      expect(band).not.toBeNull();
      expect(flattenStyle(band.props.style).backgroundColor).toBe(palette.navy);
    });
  });

  describe('WithdrawalSection waiver checkbox', () => {
    const base = {
      isPro: true,
      delayPreference: 'IMMEDIATE' as const,
      onToggleWaiver: () => {},
      onSelectDelayPreference: () => {},
      onOpenInfoSheet: () => {},
    };
    const boxOf = (waiverAccepted: boolean) => {
      const tree = WithdrawalSection({ ...base, waiverAccepted });
      const checkbox = findNode(tree, (n) => n.props?.accessibilityRole === 'checkbox');
      expect(checkbox).not.toBeNull();
      return flattenStyle(findNode(checkbox.props.children, (n) => flattenStyle(n.props?.style).borderRadius === 5)?.props.style);
    };

    it('fills navy, not black, once the waiver is ticked', () => {
      const ticked = boxOf(true);
      expect(ticked.backgroundColor).toBe(palette.navy);
      expect(ticked.borderColor).toBe(palette.navy);
    });

    it('stays paper with a line border while unticked', () => {
      const unticked = boxOf(false);
      expect(unticked.backgroundColor).toBe(palette.paper);
      expect(unticked.borderColor).toBe(palette.line);
    });
  });

  describe('buildPaymentSheetParams', () => {
    it('asks the SDK for Apple Pay and Google Pay with the FR country code', () => {
      const params = buildPaymentSheetParams({
        clientSecret: 'pi_test_secret_123',
        accentColor: palette.red,
        palette,
        radii: { field: 14 },
        isTestMode: true,
      });

      // Asking is not enabling: Apple Pay only appears when the build carries the Apple Pay
      // entitlement, which apps/mobile/app.json does not (see CLIENT_FEEDBACK_V6_REVIEW.md FND-031).
      expect(params.applePay).toEqual({ merchantCountryCode: 'FR' });
      expect(params.googlePay).toMatchObject({ merchantCountryCode: 'FR' });
      expect(params.merchantDisplayName).toBe('Revime');
      expect(params.paymentIntentClientSecret).toBe('pi_test_secret_123');
      expect(params.returnURL).toBe('revime://stripe-redirect');
    });
  });
});
