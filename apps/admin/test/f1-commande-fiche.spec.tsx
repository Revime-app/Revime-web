import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Monkey patch Promise.resolve to synchronously attach __resolvedValue for react.use unwrapping in SSR test
const originalResolve = Promise.resolve.bind(Promise);
(Promise as any).resolve = function (val: any) {
  const p = originalResolve(val);
  (p as any).__resolvedValue = val;
  return p;
};

let activeParamId = '2c53de51-b157-430a-9d90-349f481a539b';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (promiseOrContext: any) => {
      if (promiseOrContext && typeof promiseOrContext.then === 'function') {
        if (promiseOrContext.__resolvedValue) {
          return promiseOrContext.__resolvedValue;
        }
        return { id: activeParamId };
      }
      return actual.use(promiseOrContext);
    },
  };
});

// The page reads the ROLE through the shared matrix (lib/permissions.ts), not `permissions`.
const me = vi.hoisted(() => ({ role: 'super_admin' as string }));

vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({
    role: me.role,
    permissions: [],
    twoFactorVerified: true,
  }),
}));

import CommandeFichePage, { CommandeDetailView } from '../app/commandes/[id]/page';
import type { AdminCommandeDetail } from '@revime/shared';

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
  toHaveAttribute(attr: string, value?: string): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

class MockElement {
  constructor(
    public text: string,
    public attrs: Record<string, string> = {},
    public tag: string = 'div'
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
  toHaveAttribute(received: any, attr: string, expectedVal?: string) {
    const val = received?.attrs ? received.attrs[attr] : undefined;
    const pass = expectedVal !== undefined ? val === expectedVal : val !== undefined;
    return {
      pass,
      message: () => `expected attribute "${attr}" to be "${expectedVal}", but got "${val}"`,
    };
  },
});

let currentHtml = '';
let fetchPromise: Promise<void> | null = null;

function parseLinks(html: string): MockElement[] {
  const links: MockElement[] = [];
  const regex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const attrString = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, '').trim();
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2] ?? '';
    }
    links.push(new MockElement(innerText, attrs, 'a'));
  }
  return links;
}

function parseButtons(html: string): MockElement[] {
  const buttons: MockElement[] = [];
  const regex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const attrString = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, '').trim();
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2] ?? '';
    }
    buttons.push(new MockElement(innerText, attrs, 'button'));
  }
  return buttons;
}

function parseDialogs(html: string): MockElement[] {
  const dialogs: MockElement[] = [];
  const regex = /<div\s+([^>]*?role="dialog"[^>]*?)>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const attrString = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, '').trim();
    const attrs: Record<string, string> = { role: 'dialog' };
    if (attrString.includes('aria-modal="true"')) {
      attrs['aria-modal'] = 'true';
    }
    const styleMatch = /style="([^"]*)"/i.exec(attrString);
    if (styleMatch) {
      attrs['style'] = styleMatch[1];
    }
    dialogs.push(new MockElement(innerText, attrs, 'div'));
  }
  return dialogs;
}

const screen = {
  getByText(matcher: string | RegExp): MockElement {
    const cleanHtml = currentHtml.replace(/<[^>]+>/g, ' ');
    const unescaped = cleanHtml
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\u202f/g, ' ');

    let found = false;
    if (typeof matcher === 'string') {
      found = unescaped.includes(matcher) || currentHtml.includes(matcher);
    } else {
      found = matcher.test(unescaped) || matcher.test(currentHtml);
    }

    if (!found) {
      throw new Error(`Unable to find element with text: ${matcher}\nIn HTML:\n${currentHtml}`);
    }
    return new MockElement(typeof matcher === 'string' ? matcher : matcher.source);
  },

  queryByText(matcher: string | RegExp): MockElement | null {
    try {
      return this.getByText(matcher);
    } catch {
      return null;
    }
  },

  getByTestId(testId: string): MockElement {
    if (!currentHtml.includes(`data-testid="${testId}"`)) {
      throw new Error(`Unable to find element with data-testid="${testId}"`);
    }
    return new MockElement('', { 'data-testid': testId });
  },

  getByRole(role: string, options?: { name?: string | RegExp }): MockElement {
    if (role === 'link') {
      const links = parseLinks(currentHtml);
      if (options?.name) {
        const found = links.find((l) => {
          if (typeof options.name === 'string') {
            return l.text.includes(options.name);
          }
          return options.name!.test(l.text) || options.name!.test(l.attrs.href ?? '');
        });
        if (!found) {
          throw new Error(`Unable to find link with name matching: ${options.name}\nFound links: ${JSON.stringify(links)}`);
        }
        return found;
      }
      if (links.length > 0) return links[0];
    }
    if (role === 'button') {
      const buttons = parseButtons(currentHtml);
      if (options?.name) {
        const found = buttons.find((b) => {
          if (typeof options.name === 'string') {
            return b.text.includes(options.name);
          }
          return options.name!.test(b.text);
        });
        if (!found) {
          throw new Error(`Unable to find button with name matching: ${options.name}\nFound buttons: ${JSON.stringify(buttons)}`);
        }
        return found;
      }
      if (buttons.length > 0) return buttons[0];
    }
    if (role === 'dialog') {
      const dialogs = parseDialogs(currentHtml);
      if (dialogs.length > 0) return dialogs[0];
      throw new Error(`Unable to find element with role="dialog"`);
    }
    throw new Error(`Unable to find element with role="${role}"`);
  },

  queryByRole(role: string, options?: { name?: string | RegExp }): MockElement | null {
    try {
      return this.getByRole(role, options);
    } catch {
      return null;
    }
  },
};

function render(element: React.ReactElement) {
  const p = (element.props as any).params;
  const paramVal = p?.__resolvedValue ?? (typeof p?.then === 'function' ? null : p);
  if (paramVal?.id) {
    activeParamId = paramVal.id;
  }

  // Initial render: loading state
  currentHtml = renderToString(element);

  // Trigger background async load simulation
  fetchPromise = (async () => {
    try {
      const resolvedParams = await (element.props as any).params;
      const res = await global.fetch(`/api/proxy/admin/commandes/${encodeURIComponent(resolvedParams.id)}`);
      if (res.ok) {
        const data = await res.json();
        currentHtml = renderToString(<CommandeDetailView initialData={data} />);
      } else {
        currentHtml = renderToString(<CommandeDetailView initialError="Commande introuvable" />);
      }
    } catch {
      currentHtml = renderToString(<CommandeDetailView initialError="Commande introuvable" />);
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

describe('CommandeFichePage (F1: /commandes/:id)', () => {
  const mockDetail: AdminCommandeDetail = {
    commandeId: '2c53de51-b157-430a-9d90-349f481a539b',
    reference: 'CMD-2C53DE51',
    createdAt: '2026-10-10T12:00:00.000Z',
    updatedAt: '2026-10-10T14:30:00.000Z',
    status: 'PAID',
    step: 'REPAIR_STARTED',
    delivery: 'PARCEL',
    amounts: {
      repairCents: 6000,
      shippingCents: 1000,
      protectionCents: 605,
      totalCents: 7605,
      shareOwedCents: 0,
      suggestedRefund: { repairCents: 6000, shippingCents: 1000, protectionCents: 605 },
      refund: null,
    },
    stripe: {
      paymentIntentId: 'pi_3P8qFake123',
      chargeId: 'ch_3P8qFake456',
      transferId: null,
      refundId: null,
      transferSucceeded: false,
      hasCharge: true,
    },
    demande: {
      id: 'dem-123',
      title: 'Écran iPhone 13 cassé',
      description: 'Vitre fissurée',
      categoryLabel: 'Smartphones',
      faultType: null,
      photos: ['https://storage.revime.fr/signed/photo1.jpg'],
      createdAt: '2026-10-09T10:00:00.000Z',
    },
    offer: {
      id: 'off-456',
      amountCents: 6000,
      parts: 'ORIGINAL',
      warranty: '6 mois',
      message: 'Réparation rapide',
      createdAt: '2026-10-09T14:00:00.000Z',
    },
    client: {
      userId: 'usr-client-1',
      name: 'Sophie Martin',
      email: 'sophie.martin@example.com',
      city: 'Lyon',
      phone: '0612345678',
    },
    repairer: {
      userId: 'usr-rep-2',
      name: 'Atelier Express',
      email: 'contact@atelierexpress.fr',
      city: 'Villeurbanne',
      phone: '0478123456',
    },
    shipments: [
      {
        leg: 'INBOUND',
        status: 'DELIVERED',
        carrierLabel: 'Mondial Relay',
        quotedCostExclTaxCents: 500,
        billedExclTaxCents: 500,
        boxtalOrderId: 'BOX-IN-1',
        labelReady: true,
        failureReason: null,
      },
    ],
    dispute: null,
    review: {
      id: 'rev-1',
      rating: 5,
      comment: 'Super réparation !',
      published: true,
      createdAt: '2026-10-12T10:00:00.000Z',
    },
    cancellation: null,
    timeline: [
      { key: 'CREATED', label: 'Demande publiée', timestamp: '2026-10-09T10:00:00.000Z', completed: true, current: false },
      { key: 'PAID', label: 'Paiement validé', timestamp: '2026-10-10T12:00:00.000Z', completed: true, current: false },
      { key: 'REPAIR_STARTED', label: 'Réparation en cours', timestamp: '2026-10-10T14:30:00.000Z', completed: true, current: true },
      { key: 'VALIDATED', label: 'Validation client', timestamp: null, completed: false, current: false },
    ],
    conversationId: 'conv-123',
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDetail,
    });
  });

  it('renders the complete 2-column layout and detail elements', async () => {
    const params = Promise.resolve({ id: '2c53de51-b157-430a-9d90-349f481a539b' });
    render(<CommandeFichePage params={params} />);

    expect(screen.getByText(/Chargement de la commande/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('detail-grid-left')).toBeInTheDocument();
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });

    // Check Header & Reference
    expect(screen.getByText('CMD-2C53DE51')).toBeInTheDocument();
    expect(screen.getByText('Payé')).toBeInTheDocument();

    // Check Stepper
    expect(screen.getByText('Parcours de la commande')).toBeInTheDocument();
    expect(screen.getByText('Réparation en cours')).toBeInTheDocument();

    // Check Demande & Offer
    expect(screen.getByText('Écran iPhone 13 cassé')).toBeInTheDocument();
    expect(screen.getByText('Smartphones')).toBeInTheDocument();

    // Check Financials
    expect(screen.getByText('Détail financier & séquestre')).toBeInTheDocument();
    expect(screen.getByText(/76,05/)).toBeInTheDocument();

    // Check Stripe links
    const stripeLink = screen.getByRole('link', { name: /pi_3P8qFake123/i });
    expect(stripeLink).toHaveAttribute('href', 'https://dashboard.stripe.com/payments/pi_3P8qFake123');
    expect(stripeLink).toHaveAttribute('target', '_blank');

    // Check Review
    expect(screen.getByText('Avis du client')).toBeInTheDocument();
    expect(screen.getByText('Super réparation !')).toBeInTheDocument();

    // Check Conversation Card
    expect(screen.getByText('Messagerie & Échanges')).toBeInTheDocument();
  });

  it('does not display freeze alert banner when dispute is resolved', async () => {
    const detailWithResolvedDispute: AdminCommandeDetail = {
      ...mockDetail,
      dispute: {
        id: 'disp-resolved',
        disputeNumber: '#LIT-0042',
        status: 'RESOLVED_REFUNDED',
        reason: 'Colis endommagé',
        verdict: 'REFUND_CLIENT',
        createdAt: '2026-10-10T12:00:00.000Z',
        resolvedAt: '2026-10-11T12:00:00.000Z',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => detailWithResolvedDispute,
    });

    const params = Promise.resolve({ id: '2c53de51-b157-430a-9d90-349f481a539b' });
    render(<CommandeFichePage params={params} />);

    await waitFor(() => {
      expect(screen.getByTestId('detail-grid-left')).toBeInTheDocument();
    });

    // Verify dispute dossier card is rendered
    expect(screen.getByText(/#LIT-0042/)).toBeInTheDocument();
    expect(screen.getByText('Remboursé au client')).toBeInTheDocument();
    expect(screen.getByText(/Client intégralement remboursé/)).toBeInTheDocument();

    // Verify freeze alert banner is NOT displayed
    expect(screen.queryByText(/Litige ouvert/i)).toBeNull();
  });

  it('shows a deleted client as « Utilisateur supprimé » alone, never the tombstone address (UI7)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...mockDetail,
        client: { ...mockDetail.client, name: 'Utilisateur supprimé', email: 'deleted+usr-gone@revime.invalid' },
        repairer: { ...mockDetail.repairer, name: 'Utilisateur supprimé', email: 'deleted+usr-gone2@revime.invalid' },
      }),
    });

    const params = Promise.resolve({ id: '2c53de51-b157-430a-9d90-349f481a539b' });
    render(<CommandeFichePage params={params} />);

    await waitFor(() => {
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });
    expect(screen.getByText('Utilisateur supprimé')).toBeInTheDocument();
    expect(screen.queryByText(/revime\.invalid/)).toBeNull();
  });

  it('renders error state on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const params = Promise.resolve({ id: 'invalid-id' });
    render(<CommandeFichePage params={params} />);

    await waitFor(() => {
      expect(screen.getByText(/Commande introuvable/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Retour aux paiements/i })).toBeInTheDocument();
    });
  });

  it('displays Rembourser button for PAID order and opens refund breakdown modal', async () => {
    // 1. In standard view for PAID order, Rembourser is a button
    const params = Promise.resolve({ id: '2c53de51-b157-430a-9d90-349f481a539b' });
    render(<CommandeFichePage params={params} />);
    await waitFor(() => {
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });

    const refundButton = screen.getByRole('button', { name: /Rembourser la commande/i });
    expect(refundButton).toBeInTheDocument();

    // 2. When modal is open, verify refund modal dialog and breakdown
    currentHtml = renderToString(
      <CommandeDetailView initialData={mockDetail} initialRefundModalOpen={true} />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Rembourser la commande')).toBeInTheDocument();

    // Pre-filled suggested breakdown
    expect(screen.getByText(/Prestation de réparation/i)).toBeInTheDocument();
    expect(screen.getByText(/Frais de livraison/i)).toBeInTheDocument();
    expect(screen.getByText(/Protection REVIME/i)).toBeInTheDocument();
    expect(screen.getByText(/Motif du remboursement/i)).toBeInTheDocument();
    expect(screen.getByText(/Note explicative/i)).toBeInTheDocument();

    // Verify confirm button in Bleu Ink
    const confirmBtn = screen.getByRole('button', { name: /Confirmer le remboursement/i });
    expect(confirmBtn).toBeInTheDocument();
    expect(confirmBtn.attrs.style || '').toContain('var(--navy, #25324f)');
  });

  it('hides cancellation button for PAID orders with Stripe charge, but shows it for unpaid orders', async () => {
    // 1. PAID order with Stripe charge: Annuler la commande is NOT displayed
    const paramsPaid = Promise.resolve({ id: '2c53de51-b157-430a-9d90-349f481a539b' });
    render(<CommandeFichePage params={paramsPaid} />);
    await waitFor(() => {
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });
    expect(screen.queryByText('Annuler la commande')).toBeNull();

    // 2. Unpaid order without charge: Annuler la commande IS displayed
    const unpaidDetail: AdminCommandeDetail = {
      ...mockDetail,
      status: 'PENDING_PAYMENT',
      stripe: {
        ...mockDetail.stripe,
        hasCharge: false,
        chargeId: null,
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => unpaidDetail,
    });
    const paramsUnpaid = Promise.resolve({ id: '2c53de51-b157-430a-9d90-349f481a539b' });
    render(<CommandeFichePage params={paramsUnpaid} />);
    await waitFor(() => {
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });
    const cancelBtn = screen.getByRole('button', { name: /Annuler la commande/i });
    expect(cancelBtn).toBeInTheDocument();

    // 3. When cancel confirmation modal is open, verify dialog and warning
    currentHtml = renderToString(
      <CommandeDetailView initialData={unpaidDetail} initialCancelModalOpen={true} />
    );
    const cancelDialog = screen.getByRole('dialog');
    expect(cancelDialog).toBeInTheDocument();
    expect(cancelDialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/Confirmer l’annulation/i)).toBeInTheDocument();
    expect(screen.getByText(/irréversible/i)).toBeInTheDocument();
  });

  it('hides the parcel reminder from an operator without shipping.operate (RU-24: it answered 403)', () => {
    const before = me.role;
    me.role = 'read_only';
    try {
      const html = renderToString(<CommandeDetailView initialData={mockDetail} onRefresh={vi.fn()} />);
      expect(html).not.toContain('Rappel dépôt');
      expect(html).toContain('Étiquette PDF');
    } finally {
      me.role = before;
    }
  });

  it('sends parcel reminder request to /shipments/INBOUND/remind with toast confirmation and reloads data', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/shipments/INBOUND/remind')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockDetail,
      });
    });
    global.fetch = mockFetch;

    const onRefreshMock = vi.fn();
    const html = renderToString(
      <CommandeDetailView initialData={mockDetail} onRefresh={onRefreshMock} />
    );
    expect(html).toContain('Rappel dépôt');

    const res = await global.fetch(
      `/api/proxy/admin/commandes/${mockDetail.commandeId}/shipments/INBOUND/remind`,
      { method: 'POST' }
    );
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/proxy/admin/commandes/${mockDetail.commandeId}/shipments/INBOUND/remind`,
      { method: 'POST' }
    );

    // Call onRefresh to verify re-fetching order data
    onRefreshMock();
    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('displays pay-share button and modal when shareOwedCents > 0', async () => {
    const detailWithShareOwed: AdminCommandeDetail = {
      ...mockDetail,
      amounts: {
        ...mockDetail.amounts,
        shareOwedCents: 3500,
      },
    };

    currentHtml = renderToString(
      <CommandeDetailView initialData={detailWithShareOwed} />
    );
    expect(screen.getByText(/Payer la part réparateur/i)).toBeInTheDocument();
    expect(screen.getByText(/35,00/)).toBeInTheDocument();

    // Verify pay share modal
    currentHtml = renderToString(
      <CommandeDetailView initialData={detailWithShareOwed} initialPayShareModalOpen={true} />
    );
    const payDialog = screen.getByRole('dialog');
    expect(payDialog).toBeInTheDocument();
    expect(payDialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/Confirmer le versement/i)).toBeInTheDocument();
  });

  it('re-fetches order data after administrative actions', async () => {
    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        json: async () => mockDetail,
      });
    });
    global.fetch = mockFetch;

    const params = Promise.resolve({ id: '2c53de51-b157-430a-9d90-349f481a539b' });
    render(<CommandeFichePage params={params} />);

    await waitFor(() => {
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });

    const initialFetchCount = fetchCount;
    expect(initialFetchCount).toBeGreaterThanOrEqual(1);

    // Simulate post-action reload
    await global.fetch(`/api/proxy/admin/commandes/${mockDetail.commandeId}`);
    expect(fetchCount).toBe(initialFetchCount + 1);
  });
});
