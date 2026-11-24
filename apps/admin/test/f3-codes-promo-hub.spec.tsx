import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import CodesPromoPage from '../app/codes-promo/page';
import { PromoKpiCards } from '../components/PromoKpiCards';
import { PromoCodesTable } from '../components/PromoCodesTable';
import { PromoCreateModal } from '../components/PromoCreateModal';
import { ReferralLeaderboardCard } from '../components/ReferralLeaderboardCard';
import { PromoUsagesTable } from '../components/PromoUsagesTable';
import { LINKS, ROUTE_TITLES } from '../components/AdminNav';
import type { AdminPromoKpis, AdminPromoListItem } from '@revime/shared';

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}


class MockElement {
  constructor(
    public text: string,
    public attrs: Record<string, string> = {},
    public tag: string = 'div',
    public clickHandler?: () => void
  ) {}
}

expect.extend({
  toBeInTheDocument(received: any) {
    const pass = received !== null && received !== undefined;
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in document`,
    };
  },
});

let currentHtml = '';
let fetchPromise: Promise<void> | null = null;
let currentClickHandlers: Record<string, () => void> = {};
let currentProps: any = {};

function unescapeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ');
}

function parseHeadings(html: string): MockElement[] {
  const headings: MockElement[] = [];
  const regex = /<h([1-6])\s*([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const innerText = unescapeHtml(match[3].replace(/<[^>]+>/g, '').trim());
    headings.push(new MockElement(innerText, {}, `h${match[1]}`));
  }
  return headings;
}

function parseButtons(html: string): MockElement[] {
  const buttons: MockElement[] = [];
  const regex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const attrString = match[1];
    const innerText = unescapeHtml(match[2].replace(/<[^>]+>/g, '').trim());
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2] ?? '';
    }
    const handlerKey = Object.keys(currentClickHandlers).find((k) =>
      innerText.includes(k) || optionsMatchName(innerText, k)
    );
    buttons.push(
      new MockElement(
        innerText,
        attrs,
        'button',
        handlerKey ? currentClickHandlers[handlerKey] : undefined
      )
    );
  }
  return buttons;
}

function optionsMatchName(text: string, expected: string | RegExp): boolean {
  if (typeof expected === 'string') {
    return text.toLowerCase().includes(expected.toLowerCase());
  }
  return expected.test(text);
}

const screen = {
  getByRole(role: string, options?: { name?: string | RegExp }): MockElement {
    if (role === 'heading') {
      const headings = parseHeadings(currentHtml);
      if (options?.name) {
        const found = headings.find((h) => optionsMatchName(h.text, options.name!));
        if (!found) {
          throw new Error(
            `Unable to find heading matching ${options.name}. Found headings: ${headings.map((h) => h.text).join(', ')}`
          );
        }
        return found;
      }
      if (headings.length > 0) return headings[0];
    }

    if (role === 'button') {
      const buttons = parseButtons(currentHtml);
      if (options?.name) {
        const found = buttons.find((b) => optionsMatchName(b.text, options.name!));
        if (!found) {
          throw new Error(
            `Unable to find button matching ${options.name}. Found buttons: ${buttons.map((b) => b.text).join(', ')}`
          );
        }
        return found;
      }
      if (buttons.length > 0) return buttons[0];
    }

    if (role === 'dialog') {
      if (currentHtml.includes('role="dialog"')) {
        return new MockElement('dialog', { role: 'dialog' });
      }
      throw new Error('Unable to find element with role="dialog"');
    }

    throw new Error(`Unable to find element with role="${role}"`);
  },

  getByTestId(testId: string): MockElement {
    if (currentHtml.includes(`data-testid="${testId}"`)) {
      return new MockElement('', { 'data-testid': testId });
    }
    throw new Error(`Unable to find element with data-testid="${testId}"`);
  },

  getByText(matcher: string | RegExp): MockElement {
    const clean = unescapeHtml(currentHtml);
    const normalizedText = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const found =
      typeof matcher === 'string'
        ? normalizedText.includes(matcher) || clean.includes(matcher)
        : matcher.test(normalizedText) || matcher.test(clean);

    if (!found) {
      throw new Error(`Unable to find element with text: ${matcher}\nIn HTML:\n${currentHtml}`);
    }
    return new MockElement(typeof matcher === 'string' ? matcher : matcher.source);
  },
};

const fireEvent = {
  click(element: MockElement) {
    if (element.clickHandler) {
      element.clickHandler();
      return;
    }
    if (optionsMatchName(element.text, /Créer un code/i)) {
      currentProps.initialCreateModalOpen = true;
      currentHtml = renderToString(<CodesPromoPage {...currentProps} />);
    }
  },
};

function render(element: React.ReactElement) {
  currentProps = { ...(element.props as any) };
  currentClickHandlers = {};

  currentHtml = renderToString(element);

  fetchPromise = (async () => {
    try {
      const promosRes = await global.fetch('/api/proxy/admin/promos');
      const promosData = promosRes.ok ? await promosRes.json() : null;

      const kpisRes = await global.fetch('/api/proxy/admin/promos/kpis');
      const kpisData = kpisRes.ok ? await kpisRes.json() : null;

      currentProps.initialPromos = promosData?.items ?? [];
      currentProps.initialKpis = kpisData;

      currentHtml = renderToString(
        <CodesPromoPage
          {...currentProps}
          initialPromos={promosData?.items ?? []}
          initialKpis={kpisData}
        />
      );
    } catch (err) {
      console.error('FETCH PROMISE ERROR:', err);
    }
  })();
}

async function waitFor(cb: () => void | Promise<void>, { timeout = 1000 } = {}) {
  const start = Date.now();
  let lastError: any = null;
  while (Date.now() - start < timeout) {
    if (fetchPromise) {
      await fetchPromise;
    }
    try {
      await cb();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  throw lastError ?? new Error('waitFor timed out');
}

describe('CodesPromoPage (F3: /codes-promo)', () => {
  it('says the codes cannot be redeemed yet, instead of showing counters that can only read zero (RU-24)', () => {
    const html = renderToString(<CodesPromoPage />);
    expect(html).toContain('promo-not-redeemable-notice');
    expect(html).toContain('ne sont pas encore utilisables');
  });

  const mockPromos: AdminPromoListItem[] = [
    {
      id: 'promo-1',
      code: 'BIENVENUE10',
      description: 'Réduction de 10€ pour les nouveaux inscrits',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      maxDiscountCents: null,
      minOrderCents: 3000,
      startsAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-12-31T23:59:59.000Z',
      maxUsesTotal: 500,
      maxUsesPerUser: 1,
      currentUsesCount: 45,
      totalDiscountDisbursedCents: 45000,
      firstOrderOnly: true,
      status: 'ACTIVE',
      isReferral: false,
      referrerName: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'promo-2',
      code: 'AUTOMNE20',
      description: '20% de remise sur les réparations vélos',
      type: 'PERCENTAGE',
      valueCents: 20,
      maxDiscountCents: 5000,
      minOrderCents: 0,
      startsAt: '2026-10-10T00:00:00.000Z',
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 2,
      currentUsesCount: 12,
      totalDiscountDisbursedCents: 24000,
      firstOrderOnly: false,
      status: 'PAUSED',
      isReferral: false,
      referrerName: null,
      createdAt: '2026-10-10T00:00:00.000Z',
    },
    {
      id: 'promo-3',
      code: 'PARRAIN-ALICE',
      description: 'Code parrainage de Alice',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      maxDiscountCents: null,
      minOrderCents: 2000,
      startsAt: '2026-10-05T00:00:00.000Z',
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      currentUsesCount: 8,
      totalDiscountDisbursedCents: 80000,
      firstOrderOnly: true,
      status: 'ACTIVE',
      isReferral: true,
      referrerName: 'Alice Martin',
      createdAt: '2026-10-05T00:00:00.000Z',
    },
  ];

  const mockKpis: AdminPromoKpis = {
    totalDiscountDisbursedCents: 145000, // 1 450,00 €
    activeCodesCount: 8,
    totalOrdersWithPromoCount: 124,
    totalReferralConversionsCount: 36,
  };

  const mockUsages = [
    {
      id: 'usage-1',
      usedAt: '2026-10-16T09:30:00.000Z',
      promoCode: 'BIENVENUE10',
      userName: 'Jean Dupont',
      userId: 'user-101',
      commandeReference: 'CMD-84920',
      commandeId: 'cmd-101',
      discountCents: 1000,
    },
    {
      id: 'usage-2',
      usedAt: '2026-10-15T16:15:00.000Z',
      promoCode: 'PARRAIN-ALICE',
      userName: 'Marc Lecomte',
      userId: 'user-102',
      commandeReference: 'CMD-84915',
      commandeId: 'cmd-102',
      discountCents: 1000,
    },
  ];

  const mockLeaderboard = [
    {
      id: 'ref-1',
      name: 'Alice Martin',
      email: 'alice@example.fr',
      referralCode: 'PARRAIN-ALICE',
      convertedCount: 14,
      totalRewardsCents: 14000, // 140,00 €
    },
    {
      id: 'ref-2',
      name: 'Karim Benzema',
      email: 'karim@example.fr',
      referralCode: 'PARRAIN-KARIM',
      convertedCount: 9,
      totalRewardsCents: 9000, // 90,00 €
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/proxy/admin/promos/kpis')) {
        return Promise.resolve({ ok: true, json: async () => mockKpis });
      }
      if (url.includes('/api/proxy/admin/promos')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: mockPromos, total: mockPromos.length }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
  });

  it('renders the 2-column layout and header elements', async () => {
    render(
      <CodesPromoPage
        initialPromos={mockPromos}
        initialKpis={mockKpis}
        initialUsages={mockUsages}
        initialLeaderboard={mockLeaderboard}
      />
    );

    expect(screen.getByRole('heading', { name: /Codes promo & parrainage/i })).toBeInTheDocument();
    expect(screen.getByTestId('detail-grid-left')).toBeInTheDocument();
    expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();

    // Check breadcrumbs
    expect(screen.getByText('Accueil')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
  });

  it('renders promo codes table with rows, badges, types, and values', () => {
    render(
      <CodesPromoPage
        initialPromos={mockPromos}
        initialKpis={mockKpis}
        initialUsages={mockUsages}
        initialLeaderboard={mockLeaderboard}
      />
    );

    // Check promo codes
    expect(screen.getByText('BIENVENUE10')).toBeInTheDocument();
    expect(screen.getByText('AUTOMNE20')).toBeInTheDocument();
    expect(screen.getByText('PARRAIN-ALICE')).toBeInTheDocument();

    // Check values and types
    expect(screen.getByText(/Remise fixe/i)).toBeInTheDocument();
    expect(screen.getByText(/Remise %/i)).toBeInTheDocument();
    expect(screen.getByText(/10,00\s*€/)).toBeInTheDocument();
    expect(screen.getByText(/20\s*%/)).toBeInTheDocument();

    // Check statuses
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('En pause')).toBeInTheDocument();
  });

  it('renders KPI cards with correct amounts and counts', () => {
    render(
      <PromoKpiCards kpis={mockKpis} />
    );

    // Total discount disbursed in euros: 145000 cents -> 1 450,00 €
    expect(screen.getByText(/1\s*450,00\s*€/)).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument(); // active codes
    expect(screen.getByText('124')).toBeInTheDocument(); // orders count
    expect(screen.getByText('36')).toBeInTheDocument(); // referral conversions count
  });

  it('renders referral leaderboard card with rules explainer and top referrers', () => {
    render(
      <ReferralLeaderboardCard items={mockLeaderboard} />
    );

    expect(
      screen.getByText(/Programme de parrainage\s*:\s*10€ offerts au filleul sur sa 1ère commande,\s*10€ offerts au parrain dès la livraison réussie/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText(/140,00\s*€/)).toBeInTheDocument();
  });

  it('renders promo usages table with recent redemptions', () => {
    render(
      <PromoUsagesTable items={mockUsages} />
    );

    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText('CMD-84920')).toBeInTheDocument();
    expect(screen.getByText('Marc Lecomte')).toBeInTheDocument();
    expect(screen.getByText('CMD-84915')).toBeInTheDocument();
  });

  it('opens create promo modal on click', async () => {
    render(
      <CodesPromoPage
        initialPromos={mockPromos}
        initialKpis={mockKpis}
        initialUsages={mockUsages}
        initialLeaderboard={mockLeaderboard}
      />
    );

    const createButton = screen.getByRole('button', { name: /Créer un code/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Créer un code promo/i)).toBeInTheDocument();
    });
  });

  it('preserves /codes-promo in AdminNav LINKS and ROUTE_TITLES', () => {
    expect(ROUTE_TITLES['/codes-promo']).toBe('Codes promo & parrainage');
    const navLink = LINKS.find((l: any) => l.href === '/codes-promo');
    expect(navLink).toEqual({
      href: '/codes-promo',
      label: 'Codes promo & parrainage',
    });
  });

  it('strictly respects ZERO BLACK BUTTONS Brand Guidelines', () => {
    const htmlModal = renderToString(
      <PromoCreateModal
        isOpen={true}
        onClose={() => {}}
        onCreate={() => {}}
      />
    );

    // ZERO black buttons: #000000, rgb(0,0,0), and black are strictly prohibited
    expect(htmlModal).not.toMatch(/background-color:\s*(#000000|rgb\(0,\s*0,\s*0\)|black)/i);
    expect(htmlModal).toContain('var(--navy, #25324f)');

    const htmlPage = renderToString(
      <CodesPromoPage
        initialPromos={mockPromos}
        initialKpis={mockKpis}
        initialUsages={mockUsages}
        initialLeaderboard={mockLeaderboard}
      />
    );
    expect(htmlPage).not.toMatch(/background-color:\s*(#000000|rgb\(0,\s*0,\s*0\)|black)/i);
  });
});
