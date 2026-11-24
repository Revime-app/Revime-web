import Link from 'next/link';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { Icon } from '../components/Icon';

export const metadata: Metadata = {
  title: 'Page introuvable · Revime Admin',
  description: 'La page demandée est introuvable.',
};

export default function NotFound() {
  return (
    <div
      className="page"
      data-testid="admin-not-found"
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
          backgroundColor: 'var(--badge-info-bg)',
          color: 'var(--badge-info-text)',
          fontSize: '28px',
          marginBottom: '20px',
        }}
        aria-hidden="true"
      >
        <Icon as={Search} />
      </div>

      <h1
        style={{
          fontSize: '32px',
          fontWeight: 700,
          color: 'var(--ink, #25324F)',
          marginBottom: '8px',
          letterSpacing: '-0.02em',
        }}
      >
        404 · Page introuvable
      </h1>

      <p
        style={{
          fontSize: '15px',
          color: 'var(--muted, #6b7280)',
          marginBottom: '28px',
          lineHeight: 1.6,
        }}
      >
        La ressource que vous recherchez n&apos;existe pas, a été déplacée ou nécessite des droits d&apos;accès différents.
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: 'var(--navy)',
            color: '#ffffff',
            padding: '10px 22px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            minWidth: '220px',
          }}
        >
          Retour au tableau de bord
        </Link>

        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginTop: '8px',
            fontSize: '13px',
          }}
        >
          <Link
            href="/litiges"
            style={{
              color: 'var(--ink, #25324F)',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            Litiges
          </Link>
          <span style={{ color: 'var(--line, #dfe2e2)' }}>|</span>
          <Link
            href="/demandes"
            style={{
              color: 'var(--ink, #25324F)',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            Demandes
          </Link>
          <span style={{ color: 'var(--line, #dfe2e2)' }}>|</span>
          <Link
            href="/utilisateurs"
            style={{
              color: 'var(--ink, #25324F)',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            Utilisateurs
          </Link>
        </div>
      </div>
    </div>
  );
}
