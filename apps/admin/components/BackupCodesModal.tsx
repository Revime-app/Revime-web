'use client';

import React, { useState, useEffect } from 'react';
import { authErrorMessageFr } from '@revime/shared';
import { twoFactor } from '../lib/auth-client';
import { TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export function formatBackupCodesTextFile(codes: string[], timestamp?: string): string {
  const dateStr = timestamp ? new Date(timestamp).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');
  const codeLines = codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`).join('\r\n');

  return `=======================================================
REVIME Admin — Codes de secours 2FA
Date de génération : ${dateStr}
=======================================================

ATTENTION : Chaque code ne peut être utilisé qu'une seule fois.
Conservez ce document dans un endroit sûr (ex: gestionnaire de mots de passe sécurisé).
La génération de nouveaux codes invalide immédiatement les précédents.

Vos codes de secours :
-------------------------------------------------------
${codeLines}
-------------------------------------------------------
`;
}

interface BackupCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCodes?: string[];
}

export function BackupCodesModal({ isOpen, onClose, initialCodes = [] }: BackupCodesModalProps) {
  const [codes, setCodes] = useState<string[]>(initialCodes);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialCodes && initialCodes.length > 0) {
      setCodes(initialCodes);
    }
  }, [initialCodes]);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setError(null);
      setCopied(false);
      setCodes(initialCodes);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Veuillez saisir votre mot de passe.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await twoFactor.generateBackupCodes({ password });
      setBusy(false);

      if (res.error || !res.data) {
        setError(authErrorMessageFr(res.error?.code, 'Génération impossible. Vérifiez votre mot de passe.'));
        return;
      }

      setCodes(res.data.backupCodes || []);
      setPassword('');
    } catch (caught: unknown) {
      setBusy(false);
      setError((caught as Error)?.message || 'Erreur lors de la génération des codes.');
    }
  }

  async function handleCopy() {
    if (codes.length === 0) return;
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleDownload() {
    if (codes.length === 0) return;
    const content = formatBackupCodesTextFile(codes);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codes-secours-revime.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-codes-modal-title"
      data-testid="backup-codes-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--line, #dfe2e2)',
          padding: '24px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2
            id="backup-codes-modal-title"
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--ink, #141414)',
            }}
          >
            Codes de secours (2FA)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--muted, #6b7280)',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--ink, #141414)', marginBottom: '16px', lineHeight: 1.5 }}>
          Les codes de secours permettent de vous connecter à REVIME Admin en cas de perte de votre téléphone ou de votre application d&apos;authentification.
          Chaque code ne peut être utilisé qu&apos;une seule fois.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--badge-danger-bg)',
              color: 'var(--red, #f61b39)',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {codes.length === 0 ? (
          <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                htmlFor="backup-codes-password"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}
              >
                Confirmez votre mot de passe pour générer de nouveaux codes :
              </label>
              <input
                id="backup-codes-password"
                data-testid="backup-codes-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={busy}
                placeholder="Votre mot de passe"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--ink, #141414)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                data-testid="generate-backup-codes-btn"
                disabled={busy}
                style={{
                  backgroundColor: 'var(--navy, #25324f)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {busy ? 'Génération...' : 'Générer de nouveaux codes'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div
              style={{
                backgroundColor: 'var(--badge-warning-bg)',
                border: '1px solid var(--badge-warning-border)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '12px',
                color: 'var(--badge-warning-text)',
              }}
            >
              <Icon as={TriangleAlert} /> <strong>Important :</strong> Conservez ces codes dans un gestionnaire de mots de passe ou téléchargez-les. Ils ne seront plus affichés une fois cette fenêtre fermée.
            </div>

            <ul
              data-testid="backup-codes-list"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                listStyle: 'none',
                padding: '12px',
                margin: '0 0 16px 0',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: '8px',
              }}
            >
              {codes.map((code) => (
                <li key={code} style={{ textAlign: 'center' }}>
                  <code
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      color: 'var(--navy-text, #25324f)',
                    }}
                  >{code}</code>
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  data-testid="copy-backup-codes-btn"
                  onClick={handleCopy}
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--ink, #141414)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {copied ? 'Copié !' : 'Copier les codes'}
                </button>
                <button
                  type="button"
                  data-testid="download-backup-codes-btn"
                  onClick={handleDownload}
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--navy-text, #25324f)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Télécharger (.txt)
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                style={{
                  backgroundColor: 'var(--navy, #25324f)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                J&apos;ai enregistré mes codes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
