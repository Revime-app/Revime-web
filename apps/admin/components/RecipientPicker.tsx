'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { AdminBroadcastRecipientSuggestion } from '@revime/shared';
import {
  createRecipientSearch,
  nextActiveIndex,
  recipientChip,
  recipientLine,
} from '../lib/recipient-search';

const LISTBOX_ID = 'target-recipient-listbox';
const optionId = (i: number) => `target-recipient-option-${i}`;

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid var(--line, #dfe2e2)',
  borderRadius: 'var(--r-field, 4px)',
  backgroundColor: 'var(--paper, #ffffff)',
  color: 'var(--ink, #141414)',
};

export interface RecipientPickerViewProps {
  query: string;
  suggestions: AdminBroadcastRecipientSuggestion[];
  activeIndex: number;
  open: boolean;
  /** Whether the API was asked for `query` (2 characters or more). */
  searched: boolean;
  error: string | null;
  picked: AdminBroadcastRecipientSuggestion | null;
  disabled?: boolean;
  onQueryChange: (q: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPick: (s: AdminBroadcastRecipientSuggestion) => void;
  onClear: () => void;
  onBlur?: () => void;
}

/** V7 D2 (U5): the stateless view, so each state renders and is tested on its own. */
export function RecipientPickerView({
  query,
  suggestions,
  activeIndex,
  open,
  searched,
  error,
  picked,
  disabled = false,
  onQueryChange,
  onKeyDown,
  onPick,
  onClear,
  onBlur,
}: RecipientPickerViewProps) {
  if (picked) {
    return (
      <div>
        <span style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Destinataire</span>
        <div
          data-testid="recipient-chip"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 8px 6px 12px',
            fontSize: '14px',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 4px)',
            backgroundColor: 'var(--badge-neutral-bg)',
            color: 'var(--ink, #141414)',
          }}
        >
          <span>{recipientChip(picked)}</span>
          {picked.suspended && <span className="badge badge--warning">Suspendu</span>}
          <button
            type="button"
            disabled={disabled}
            onClick={onClear}
            style={{
              padding: '4px 10px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--navy-text, #25324f)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Changer
          </button>
        </div>
      </div>
    );
  }

  const showList = open && searched;
  return (
    <div style={{ position: 'relative', maxWidth: '480px' }}>
      <label
        htmlFor="target-recipient-search"
        style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
      >
        Destinataire
      </label>
      <input
        id="target-recipient-search"
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={LISTBOX_ID}
        aria-expanded={showList}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        placeholder="Pseudo, nom ou e-mail"
        value={query}
        disabled={disabled}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        style={fieldStyle}
      />
      {showList && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 6px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}
        >
          {error ? (
            <p role="alert" style={{ margin: 0, padding: '10px 12px', fontSize: '13px', color: 'var(--badge-danger-text)' }}>
              {error}
            </p>
          ) : suggestions.length === 0 ? (
            <p style={{ margin: 0, padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
              Aucun utilisateur trouvé
            </p>
          ) : (
            <ul id={LISTBOX_ID} role="listbox" style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  // mousedown, not click: the input's blur would close the list before a click lands.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(s);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: i === activeIndex ? 'var(--badge-neutral-bg)' : 'transparent',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {recipientLine(s)}
                  </span>
                  <span style={{ display: 'inline-flex', gap: '4px', flexShrink: 0 }}>
                    {s.suspended && <span className="badge badge--warning">Suspendu</span>}
                    <span className="badge">{s.role === 'REPAIRER' ? 'Réparateur' : 'Client'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export interface RecipientPickerProps {
  picked: AdminBroadcastRecipientSuggestion | null;
  onPick: (s: AdminBroadcastRecipientSuggestion | null) => void;
  disabled?: boolean;
}

/** The search's state: debounced suggestions, arrows / Enter / Escape, then the chip. */
export function RecipientPicker({ picked, onPick, disabled = false }: RecipientPickerProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AdminBroadcastRecipientSuggestion[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);

  const searchRef = useRef<ReturnType<typeof createRecipientSearch> | null>(null);
  useEffect(() => {
    const s = createRecipientSearch({
      fetchFn: (...args) => fetch(...args),
      onResult: (r) => {
        setSuggestions(r.items);
        setSearched(r.searched);
        setError(r.error);
        setActiveIndex(-1);
      },
    });
    searchRef.current = s;
    return () => s.cancel();
  }, []);

  const pick = (s: AdminBroadcastRecipientSuggestion) => {
    searchRef.current?.cancel();
    setOpen(false);
    onPick(s);
  };

  return (
    <RecipientPickerView
      query={query}
      suggestions={suggestions}
      activeIndex={activeIndex}
      open={open}
      searched={searched}
      error={error}
      picked={picked}
      disabled={disabled}
      onQueryChange={(q) => {
        setQuery(q);
        setOpen(true);
        searchRef.current?.search(q);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setOpen(true);
          setActiveIndex((i) => nextActiveIndex(i, e.key, suggestions.length));
        } else if (e.key === 'Enter') {
          const s = suggestions[activeIndex];
          if (open && s) {
            e.preventDefault();
            pick(s);
          }
        } else if (e.key === 'Escape') {
          setOpen(false);
        }
      }}
      onPick={pick}
      onClear={() => {
        setQuery('');
        setSuggestions([]);
        setSearched(false);
        setError(null);
        setActiveIndex(-1);
        onPick(null);
      }}
      onBlur={() => setOpen(false)}
    />
  );
}
