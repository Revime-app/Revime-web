'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface CopyableReferenceProps {
  /** The raw UUID or formatted reference */
  value: string;
  /** Optional prefix if formatting from raw UUID (default: 'CMD') */
  prefix?: string;
  /** Optional destination link */
  href?: string;
  /** The link leaves the admin (Stripe dashboard): a new tab, not a client-side navigation. */
  external?: boolean;
  /** Whether to show a leading '#' (default: false) */
  hashPrefix?: boolean;
  /** Additional styling */
  style?: React.CSSProperties;
}

/** A Stripe object id: re_..., ch_..., pi_..., py_..., tr_... Never a commande reference. */
export function isStripeId(value: string): boolean {
  return /^[a-z]{2,5}_[a-zA-Z0-9_]+$/i.test(value.trim());
}

/**
 * Normalizes an identifier into a canonical short reference:
 * e.g. "2c53de51-b157-430a-..." with prefix "CMD" -> "CMD-2C53DE51"
 */
export function formatShortReference(
  value: string,
  prefix = 'CMD',
  hashPrefix = false,
): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  // If already formatted like CMD-XXXXXXXX or #CMD-XXXXXXXX
  const match = trimmed.match(/^#?([A-Za-z]+)-([A-Fa-f0-9]{6,12})/);
  if (match) {
    const p = match[1].toUpperCase();
    const hex = match[2].toUpperCase();
    return hashPrefix ? `#${p}-${hex}` : `${p}-${hex}`;
  }

  if (isStripeId(trimmed)) {
    return trimmed;
  }

  // Raw UUID or hex: strip hyphens and take first 8 chars
  const hex = trimmed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  const base = `${prefix.toUpperCase()}-${hex}`;
  return hashPrefix ? `#${base}` : base;
}

type CopyState = 'idle' | 'copied' | 'failed';

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

export function CopyableReference({
  value,
  prefix = 'CMD',
  href,
  external = false,
  hashPrefix = false,
  style,
}: CopyableReferenceProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const formatted = formatShortReference(value, prefix, hashPrefix);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      // `navigator.clipboard` is absent outside a secure context (plain http) and rejects when the
      // browser denies the permission: the operator must be told, not left clicking a dead button.
      await navigator.clipboard.writeText(formatted);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 2000);
  };

  // The default prefix is CMD, so without this check a Stripe id linked to /commandes/re_...
  const isCmd = !isStripeId(value) && (prefix === 'CMD' || formatted.startsWith('CMD-') || formatted.startsWith('#CMD-'));
  const resolvedHref = href ?? (isCmd && value ? `/commandes/${encodeURIComponent(value)}` : undefined);

  const copyLabel =
    copyState === 'copied'
      ? 'Référence copiée !'
      : copyState === 'failed'
        ? 'Copie impossible, sélectionnez la référence'
        : `Copier ${formatted}`;

  // The link wraps the reference text only: a button inside an anchor is invalid interactive
  // nesting and a screen reader announces the pair badly.
  return (
    <span
      data-testid="copyable-reference"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--ink, #141414)',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        padding: '2px 6px',
        borderRadius: '4px',
        letterSpacing: '0.02em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        ...style,
      }}
      title={`Identifiant complet : ${value}`}
    >
      {resolvedHref && external ? (
        <a
          href={resolvedHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          {formatted}
        </a>
      ) : resolvedHref ? (
        <Link
          href={resolvedHref}
          style={{ color: 'inherit', textDecoration: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          {formatted}
        </Link>
      ) : (
        <span>{formatted}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        data-testid="copy-reference-button"
        aria-label={copyLabel}
        title={copyLabel}
        style={{
          background: 'none',
          border: 'none',
          padding: '1px 3px',
          margin: 0,
          cursor: 'pointer',
          color: copyState === 'failed' ? 'var(--red-text, #bd0e26)' : 'var(--muted, #6b7280)',
          fontSize: '11px',
          lineHeight: 1,
          borderRadius: '2px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
        }}
      >
        <Icon as={copyState === 'copied' ? Check : copyState === 'failed' ? TriangleAlert : Copy} />
      </button>
      <span role="status" style={VISUALLY_HIDDEN}>
        {copyState === 'idle' ? '' : copyLabel}
      </span>
    </span>
  );
}
