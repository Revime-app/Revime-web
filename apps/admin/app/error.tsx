'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../components/Icon';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for operator visibility
    console.error('Admin application runtime error caught by boundary:', error);
  }, [error]);

  return (
    <div
      className="page"
      data-testid="admin-error-boundary"
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        maxWidth: '560px',
        margin: '60px auto',
        backgroundColor: 'var(--paper, #ffffff)',
        borderRadius: '8px',
        border: '1px solid var(--line, #dfe2e2)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'var(--badge-danger-bg)',
          color: 'var(--navy-text, #f61b39)',
          fontSize: '28px',
          marginBottom: '20px',
        }}
        aria-hidden="true"
      >
        <Icon as={TriangleAlert} />
      </div>

      <h1
        style={{
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--ink, #25324F)',
          marginBottom: '8px',
          letterSpacing: '-0.02em',
        }}
      >
        Une erreur inattendue est survenue
      </h1>

      <p
        style={{
          fontSize: '15px',
          color: 'var(--muted, #6b7280)',
          marginBottom: '24px',
          lineHeight: 1.6,
        }}
      >
        L&apos;application a rencontré un problème lors du chargement de cette page.
        Vous pouvez réessayer ou retourner au tableau de bord.
      </p>

      {/* The raw message is English, technical text; the console log above carries it. The digest
          is the reference to quote when reporting the problem. */}
      {error.digest && (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--muted, #6b7280)',
            marginBottom: '28px',
          }}
        >
          Référence : {error.digest}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => reset()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: 'var(--navy, #25324F)',
            color: '#ffffff',
            padding: '10px 22px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            minWidth: '220px',
            transition: 'background-color 0.15s ease',
          }}
        >
          Réessayer
        </button>

        <Link
          href="/"
          style={{
            color: 'var(--navy-text, #25324F)',
            textDecoration: 'underline',
            fontSize: '13.5px',
            fontWeight: 500,
            marginTop: '4px',
          }}
        >
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
