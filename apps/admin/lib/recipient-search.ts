import {
  RECIPIENT_SEARCH_MIN_CHARS,
  normaliseRecipientQuery,
  type AdminBroadcastRecipientSuggestion,
} from '@revime/shared';

/**
 * V7 D2 (U5, `DEC7-20`). The single recipient of a communication is searched for by pseudo,
 * name, e-mail or phone and picked from suggestions; the dashboard then fills `target.userId`.
 * The operator never types an internal id.
 */
export const RECIPIENT_SEARCH_DEBOUNCE_MS = 250;

const SEARCH_FAILED = 'La recherche d’utilisateurs a échoué. Réessayez.';

/** A suggestion row: « @pseudo · Nom · e-mail ». */
export function recipientLine(s: AdminBroadcastRecipientSuggestion): string {
  return [`@${s.username}`, s.name, s.email].filter(Boolean).join(' · ');
}

/** The picked person, on the chip: « @pseudo · Nom ». The summary line names « @pseudo » only. */
export function recipientChip(s: AdminBroadcastRecipientSuggestion): string {
  return `@${s.username} · ${s.name}`;
}

/** The active row after an arrow key, wrapping at both ends; -1 means none. Other keys keep it. */
export function nextActiveIndex(current: number, key: string, count: number): number {
  if (count === 0) return -1;
  if (key === 'ArrowDown') return current + 1 >= count ? 0 : current + 1;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  return current;
}

export type RecipientSearchResult = {
  /** False below 2 characters: nothing was asked, so « Aucun utilisateur trouvé » would be untrue. */
  searched: boolean;
  items: AdminBroadcastRecipientSuggestion[];
  error: string | null;
};

export async function loadRecipientSuggestions(
  fetchFn: typeof fetch,
  q: string,
): Promise<Omit<RecipientSearchResult, 'searched'>> {
  try {
    const res = await fetchFn(`/api/proxy/admin/communications/recipients?q=${encodeURIComponent(q)}`);
    if (!res.ok) return { items: [], error: SEARCH_FAILED };
    return { items: (await res.json()) as AdminBroadcastRecipientSuggestion[], error: null };
  } catch {
    return { items: [], error: SEARCH_FAILED };
  }
}

/**
 * Debounces the search and keeps only the latest answer: a slow reply to « ne » must not
 * replace the list for « nes » that arrived first.
 */
export function createRecipientSearch({
  fetchFn,
  onResult,
  delayMs = RECIPIENT_SEARCH_DEBOUNCE_MS,
}: {
  fetchFn: typeof fetch;
  onResult: (r: RecipientSearchResult) => void;
  delayMs?: number;
}): { search: (q: string) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest = 0;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    latest++;
  };

  const search = (raw: string) => {
    cancel();
    const q = normaliseRecipientQuery(raw);
    if (q.length < RECIPIENT_SEARCH_MIN_CHARS) {
      onResult({ searched: false, items: [], error: null });
      return;
    }
    const mine = latest;
    timer = setTimeout(() => {
      timer = null;
      void loadRecipientSuggestions(fetchFn, q).then((r) => {
        if (mine === latest) onResult({ searched: true, ...r });
      });
    }, delayMs);
  };

  return { search, cancel };
}
