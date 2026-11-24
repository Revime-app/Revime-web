import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminBroadcastRecipientSuggestion } from '@revime/shared';
import {
  RECIPIENT_SEARCH_DEBOUNCE_MS,
  createRecipientSearch,
  loadRecipientSuggestions,
  nextActiveIndex,
  recipientChip,
  recipientLine,
} from '../lib/recipient-search';
import { RecipientPickerView, type RecipientPickerViewProps } from '../components/RecipientPicker';
import { BroadcastAudienceSelector } from '../components/BroadcastAudienceSelector';
import { computeTargetSummary } from '../app/notifications/page';
import { sendBlocker } from '../lib/broadcast-audience';

/** V7 D2 (U5, `DEC7-20`): the single recipient is searched for, never typed as an id. */

const nes: AdminBroadcastRecipientSuggestion = {
  id: 'LQYUabcdef0123456789abcdef012345',
  username: 'nes',
  name: 'Nes Dab',
  email: 'nes@example.com',
  role: 'REPAIRER',
  suspended: false,
};
const sophie: AdminBroadcastRecipientSuggestion = {
  id: 'SOPHabcdef0123456789abcdef012345',
  username: 'sophie_m',
  name: 'Sophie Martin',
  email: 'sophie@example.com',
  role: 'CLIENT',
  suspended: true,
};

const text = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&amp;|&quot;/g, (m) => ({ '&#x27;': "'", '&amp;': '&', '&quot;': '"' })[m]!)
    .replace(/\s+/g, ' ');

const view = (over: Partial<RecipientPickerViewProps> = {}) =>
  renderToString(
    <RecipientPickerView
      query=""
      suggestions={[]}
      activeIndex={-1}
      open={false}
      searched={false}
      error={null}
      picked={null}
      onQueryChange={() => {}}
      onKeyDown={() => {}}
      onPick={() => {}}
      onClear={() => {}}
      {...over}
    />,
  );

describe('V7 U5 · what a suggestion says (Q5)', () => {
  it('reads « @pseudo · Nom · e-mail »', () => {
    expect(recipientLine(nes)).toBe('@nes · Nes Dab · nes@example.com');
  });

  it('drops a missing e-mail rather than printing an empty part', () => {
    expect(recipientLine({ ...nes, email: null })).toBe('@nes · Nes Dab');
  });

  it('names the picked person as « @pseudo · Nom » on the chip', () => {
    expect(recipientChip(nes)).toBe('@nes · Nes Dab');
  });
});

describe('V7 U5 · arrows move through the suggestions and wrap (Q5)', () => {
  it.each([
    [-1, 'ArrowDown', 3, 0],
    [0, 'ArrowDown', 3, 1],
    [2, 'ArrowDown', 3, 0],
    [-1, 'ArrowUp', 3, 2],
    [0, 'ArrowUp', 3, 2],
    [1, 'ArrowUp', 3, 0],
    [1, 'Home', 3, 1],
    [0, 'ArrowDown', 0, -1],
  ] as const)('from %i, %s over %i rows → %i', (from, key, count, to) => {
    expect(nextActiveIndex(from, key, count)).toBe(to);
  });
});

describe('V7 U5 · loading suggestions', () => {
  it('asks the recipients route with the query encoded', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => [nes] });
    const r = await loadRecipientSuggestions(fetchFn as any, 'nes dab&x');
    expect(fetchFn).toHaveBeenCalledWith('/api/proxy/admin/communications/recipients?q=nes%20dab%26x');
    expect(r).toEqual({ items: [nes], error: null });
  });

  it('says the search failed instead of « Aucun utilisateur trouvé » on an error', async () => {
    const r1 = await loadRecipientSuggestions(vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as any, 'nes');
    const r2 = await loadRecipientSuggestions(vi.fn().mockRejectedValue(new Error('offline')) as any, 'nes');
    for (const r of [r1, r2]) {
      expect(r.items).toEqual([]);
      expect(r.error).toBe('La recherche d’utilisateurs a échoué. Réessayez.');
    }
  });
});

describe('V7 U5 · the search waits 250 ms and keeps only the latest answer (Q5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits 250 ms after the last keystroke, then asks once', async () => {
    expect(RECIPIENT_SEARCH_DEBOUNCE_MS).toBe(250);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => [nes] });
    const onResult = vi.fn();
    const s = createRecipientSearch({ fetchFn: fetchFn as any, onResult });
    s.search('ne');
    await vi.advanceTimersByTimeAsync(100);
    s.search('nes');
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toContain('q=nes');
    expect(onResult).toHaveBeenLastCalledWith({ searched: true, items: [nes], error: null });
  });

  it('asks nothing below 2 characters and clears the list at once', async () => {
    const fetchFn = vi.fn();
    const onResult = vi.fn();
    const s = createRecipientSearch({ fetchFn: fetchFn as any, onResult });
    s.search('@n');
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith({ searched: false, items: [], error: null });
  });

  it('drops a slow answer that a newer query has overtaken', async () => {
    let releaseSlow!: (v: unknown) => void;
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => new Promise((res) => (releaseSlow = res)))
      .mockResolvedValueOnce({ ok: true, json: async () => [sophie] });
    const onResult = vi.fn();
    const s = createRecipientSearch({ fetchFn: fetchFn as any, onResult });
    s.search('nes');
    await vi.advanceTimersByTimeAsync(250);
    s.search('sophie');
    await vi.advanceTimersByTimeAsync(250);
    releaseSlow({ ok: true, json: async () => [nes] });
    await vi.advanceTimersByTimeAsync(0);
    const answers = onResult.mock.calls.map((c) => c[0]).filter((r) => r.searched);
    expect(answers).toEqual([{ searched: true, items: [sophie], error: null }]);
  });

  it('cancel() stops a pending search', async () => {
    const fetchFn = vi.fn();
    const s = createRecipientSearch({ fetchFn: fetchFn as any, onResult: vi.fn() });
    s.search('nes');
    s.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('V7 U5 · the field (Q5)', () => {
  it('is a combobox labelled « Destinataire », no technical id asked for', () => {
    const html = view();
    expect(html).toContain('role="combobox"');
    expect(html).toContain('id="target-recipient-search"');
    expect(text(html)).toContain('Destinataire');
    expect(html).toContain('placeholder="Pseudo, nom ou e-mail"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('lists the suggestions with their badge, the active one selected', () => {
    const html = view({ query: 'n', open: true, searched: true, suggestions: [nes, sophie], activeIndex: 1 });
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-expanded="true"');
    expect((html.match(/role="option"/g) ?? []).length).toBe(2);
    const options = html.split('role="option"').slice(1);
    expect(options[0]).toContain('aria-selected="false"');
    expect(options[1]).toContain('aria-selected="true"');
    const t = text(html);
    expect(t).toContain('@nes · Nes Dab · nes@example.com');
    expect(t).toContain('Réparateur');
    expect(t).toContain('Client');
  });

  it('marks a suspended account « Suspendu » and keeps it pickable (Q4)', () => {
    const html = view({ query: 'so', open: true, searched: true, suggestions: [sophie], activeIndex: -1 });
    expect(text(html)).toContain('Suspendu');
    expect(html.split('role="option"')[1]).not.toContain('aria-disabled="true"');
  });

  it('says « Aucun utilisateur trouvé » when the search found nobody', () => {
    expect(text(view({ query: 'zzz', open: true, searched: true }))).toContain('Aucun utilisateur trouvé');
    expect(text(view({ query: 'zzz', open: true, searched: false }))).not.toContain('Aucun utilisateur trouvé');
  });

  it('shows a search error, not « Aucun utilisateur trouvé »', () => {
    const t = text(view({ query: 'nes', open: true, searched: true, error: 'La recherche d’utilisateurs a échoué. Réessayez.' }));
    expect(t).toContain('La recherche d’utilisateurs a échoué. Réessayez.');
    expect(t).not.toContain('Aucun utilisateur trouvé');
  });

  it('becomes a chip with « Changer » once someone is picked', () => {
    const html = view({ picked: nes });
    expect(html).not.toContain('role="combobox"');
    const t = text(html);
    expect(t).toContain('@nes · Nes Dab');
    expect(t).toContain('Changer');
  });
});

describe('V7 U5 · the audience selector and the summary line', () => {
  it('no longer renders the « Identifiant utilisateur » box', () => {
    const html = renderToString(
      <BroadcastAudienceSelector target={{ type: 'INDIVIDUAL', userId: '' }} onChange={() => {}} />,
    );
    expect(html).not.toContain('target-user-id');
    expect(text(html)).not.toContain('Identifiant utilisateur');
    expect(html).toContain('id="target-recipient-search"');
  });

  it('shows the picked person on the chip when the page passes one', () => {
    const html = renderToString(
      <BroadcastAudienceSelector target={{ type: 'INDIVIDUAL', userId: nes.id }} recipient={nes} onChange={() => {}} />,
    );
    expect(text(html)).toContain('@nes · Nes Dab');
  });

  it('asks for a recipient to be chosen, not for an id, while none is picked', () => {
    expect(
      sendBlocker({ hasChannel: true, subjectValid: true, bodyValid: true, targetValid: false, sending: false, previewError: null }),
    ).toBe('Choisissez un destinataire.');
  });

  it('names the picked person in the summary line (Q6)', () => {
    expect(computeTargetSummary({ type: 'INDIVIDUAL', userId: nes.id }, nes)).toBe('Destinataire unique · @nes');
    expect(computeTargetSummary({ type: 'INDIVIDUAL', userId: '' }, null)).toBe(
      'Destinataire unique · aucun destinataire choisi',
    );
  });
});
