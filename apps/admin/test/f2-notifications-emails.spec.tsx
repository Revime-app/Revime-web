import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import NotificationsPage, { computeTargetSummary, sendSummary } from '../app/notifications/page';
import { replaceTokens } from '../components/BroadcastPreviewCard';
import { LINKS, ROUTE_TITLES } from '../components/AdminNav';
import { BroadcastConfirmModal } from '../components/BroadcastConfirmModal';

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
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
    const handlerKey = Object.keys(currentClickHandlers).find((k) => innerText.includes(k) || (optionsMatchName(innerText, k)));
    buttons.push(new MockElement(innerText, attrs, 'button', handlerKey ? currentClickHandlers[handlerKey] : undefined));
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
          throw new Error(`Unable to find heading matching ${options.name}. Found headings: ${headings.map((h) => h.text).join(', ')}`);
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
          throw new Error(`Unable to find button matching ${options.name}. Found buttons: ${buttons.map((b) => b.text).join(', ')}`);
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

  getByLabelText(matcher: string | RegExp): MockElement {
    const clean = unescapeHtml(currentHtml);
    const labelRegex = /<label\s*([^>]*)>([\s\S]*?)<\/label>/gi;
    let match: RegExpExecArray | null;
    while ((match = labelRegex.exec(clean)) !== null) {
      const inner = match[2].replace(/<[^>]+>/g, '').trim();
      if (optionsMatchName(inner, matcher)) {
        return new MockElement(inner, {}, 'label');
      }
    }
    if (optionsMatchName(clean, matcher)) {
      return new MockElement(String(matcher), {}, 'input');
    }
    throw new Error(`Unable to find element with label matching: ${matcher}`);
  },

  getByText(matcher: string | RegExp): MockElement {
    const clean = unescapeHtml(currentHtml);
    const normalizedText = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const found = typeof matcher === 'string'
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
    if (optionsMatchName(element.text, /Vérifier et envoyer/i)) {
      currentProps.initialConfirmModalOpen = true;
      currentHtml = renderToString(<NotificationsPage {...currentProps} />);
    }
  },
};

function render(element: React.ReactElement) {
  currentProps = { ...(element.props as any) };
  currentClickHandlers = {};

  // Initial SSR render
  currentHtml = renderToString(element);

  // Trigger simulated background fetches if global.fetch is mocked
  fetchPromise = (async () => {
    try {
      const previewRes = await global.fetch('/api/proxy/admin/communications/preview', { method: 'POST' });
      const previewData = previewRes.ok ? await previewRes.json() : null;

      const historyRes = await global.fetch('/api/proxy/admin/communications/history');
      const historyData = historyRes.ok ? await historyRes.json() : null;

      currentProps.initialPreview = previewData;
      currentProps.initialHistory = historyData;

      currentHtml = renderToString(
        <NotificationsPage
          {...currentProps}
          initialPreview={previewData}
          initialHistory={historyData}
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

describe('NotificationsPage (F2: /notifications)', () => {
  const mockPreview = {
    totalRecipients: 42,
    emailEligibleCount: 42,
    pushEligibleCount: 38,
    marketingEmailCount: 25,
    marketingPushCount: 20,
    sampleRecipients: [
      { id: '1', name: 'Thomas Dupont', email: 'thomas@lyon.fr', city: 'Lyon', role: 'REPAIRER' },
    ],
  };

  const mockHistory = {
    items: [
      {
        id: 'b-1',
        subject: 'Forte demande à Lyon',
        channelEmail: true,
        channelPush: true,
        targetType: 'SEGMENT',
        targetSummary: 'Réparateurs · Lyon',
        totalRecipients: 42,
        sentEmailCount: 42,
        sentPushCount: 38,
        operatorName: 'Super Admin',
        createdAt: '2026-10-16T10:00:00.000Z',
      },
    ],
    total: 1,
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/preview')) {
        return Promise.resolve({ ok: true, json: async () => mockPreview });
      }
      if (url.includes('/history')) {
        return Promise.resolve({ ok: true, json: async () => mockHistory });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
  });

  it('renders the 2-column layout and communications composer', async () => {
    render(<NotificationsPage />);

    expect(screen.getByRole('heading', { name: /Notifications & e-mails/i })).toBeInTheDocument();
    expect(screen.getByTestId('detail-grid-left')).toBeInTheDocument();
    expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();

    // Check audience selector and channels
    expect(screen.getByLabelText(/E-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Push mobile/i)).toBeInTheDocument();

    // Check live preview card
    await waitFor(() => {
      expect(screen.getByText('42 destinataires')).toBeInTheDocument();
      // The default template is a commercial one: only the opted-in members are counted.
      // V7 D1 (U6): « … avec push actif … » became « Joignables en push : N (accord marketing) ».
      expect(screen.getByText(/Joignables en push : (<!-- -->)?20/i)).toBeInTheDocument();
      expect(screen.getByText(/25 avec e-mail et accord marketing/i)).toBeInTheDocument();
    });

    // Check history table
    expect(screen.getByText('Forte demande à Lyon')).toBeInTheDocument();
    expect(screen.getByText('Réparateurs · Lyon')).toBeInTheDocument();
  });

  it('opens confirmation modal before dispatching broadcast', async () => {
    render(<NotificationsPage />);

    const sendButton = screen.getByRole('button', { name: /Vérifier et envoyer/i });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Confirmer l’envoi de la communication/i)).toBeInTheDocument();
    });
  });

  it('reports what actually left, and who was left out for want of consent (RU-24)', () => {
    expect(sendSummary({ sentEmailCount: 12, sentPushCount: 7, skippedNoConsentCount: 30 })).toBe(
      "Envoyé : 12 e-mail(s) et 7 notification(s) push. 30 membre(s) écarté(s) faute d'accord marketing.",
    );
    expect(sendSummary({ sentEmailCount: 0, sentPushCount: 0, skippedNoConsentCount: 0 })).toBe(
      'Envoyé : 0 e-mail(s) et 0 notification(s) push.',
    );
    expect(sendSummary(null)).toBe('Communication envoyée.');
  });

  it('greys out the city and department until the audience is réparateurs (RU-24)', () => {
    const html = renderToString(<NotificationsPage />);
    const tag = (id: string) => (html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) ?? [''])[0];
    // The default audience is « Tous les membres »: clients have no stored location.
    expect(tag('target-city')).toContain('disabled');
    expect(tag('target-dept')).toContain('disabled');
  });

  it('computes human-readable target summaries accurately', () => {
    expect(
      computeTargetSummary({
        type: 'SEGMENT',
        role: 'REPAIRER',
        city: 'Lyon',
        verifiedOnly: false,
        activeOnly: true,
      })
    ).toBe('Réparateurs · Lyon');

    expect(
      computeTargetSummary({
        type: 'SEGMENT',
        role: 'CLIENT',
        city: 'Marseille',
        department: '13',
        verifiedOnly: true,
        activeOnly: true,
      })
    ).toBe('Clients · Marseille · Dép. 13 · Vérifiés');

    // V7 D2 (U5, Q6): named by pseudo, never by the internal id.
    expect(
      computeTargetSummary(
        { type: 'INDIVIDUAL', userId: '123e4567-e89b-12d3-a456-426614174000' },
        { id: '123e4567-e89b-12d3-a456-426614174000', username: 'claire', name: 'Claire Dupont', email: null, role: 'CLIENT', suspended: false },
      )
    ).toBe('Destinataire unique · @claire');
  });

  it('replaces personalization tokens correctly in preview', () => {
    const template = 'Bonjour {{prenom}} {{nom}}, nous intervenons à {{ville}} !';
    const sample = { name: 'Claire Vasseur', city: 'Bordeaux' };
    expect(replaceTokens(template, sample)).toBe(
      'Bonjour Claire Vasseur, nous intervenons à Bordeaux !'
    );
  });

  it('preserves /notifications in AdminNav LINKS and ROUTE_TITLES', () => {
    expect(ROUTE_TITLES['/notifications']).toBe('Notifications & e-mails');
    const navLink = LINKS.find((l: any) => l.href === '/notifications');
    expect(navLink).toEqual({
      href: '/notifications',
      label: 'Notifications & e-mails',
    });
  });

  it('strictly respects ZERO BLACK BUTTONS Brand Guidelines', () => {
    const html = renderToString(
      <BroadcastConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        totalRecipients={42}
        channels={{ email: true, push: true }}
        subject="Test"
        body="Contenu test"
        targetSummary="Réparateurs · Lyon"
      />
    );

    // ZERO black buttons: #000000, rgb(0,0,0), and black are strictly prohibited
    expect(html).not.toMatch(/background-color:\s*(#000000|rgb\(0,\s*0,\s*0\)|black)/i);
    expect(html).toContain('var(--navy, #25324f)');
  });
});
