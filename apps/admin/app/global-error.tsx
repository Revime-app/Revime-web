'use client';

import { useEffect } from 'react';

/**
 * `app/error.tsx` wraps the page, not the root layout above it, so a crash in AdminNav,
 * AdminGate or AdminHeader (all rendered by `layout.tsx`) reaches no boundary and leaves a blank
 * screen. This file replaces the root layout when it fires, so it carries its own document and
 * cannot use the stylesheet, the tokens or the theme: plain system styles, light and dark by OS.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin application root error caught by global boundary:', error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Arial, sans-serif',
          colorScheme: 'light dark',
        }}
      >
        <main style={{ textAlign: 'center', padding: '24px', maxWidth: '520px' }}>
          <h1 style={{ fontSize: '26px', marginBottom: '8px' }}>Une erreur inattendue est survenue</h1>
          <p style={{ fontSize: '15px', lineHeight: 1.6, opacity: 0.75, marginBottom: '24px' }}>
            L&apos;application n&apos;a pas pu s&apos;afficher. Vous pouvez réessayer.
          </p>
          {error.digest && (
            <p style={{ fontSize: '12px', opacity: 0.6, marginBottom: '24px' }}>
              Référence : {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '10px 22px',
              borderRadius: '4px',
              border: '1px solid currentColor',
              background: 'transparent',
              color: 'inherit',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: '220px',
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
