'use client';

import React, { useState, useEffect } from 'react';
import { listSessions, revokeSession, revokeOtherSessions, useSession } from '../lib/auth-client';

export interface AdminSessionItem {
  id: string;
  token: string;
  userId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  expiresAt?: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function parseUserAgentDevice(userAgent?: string | null): { browser: string; os: string; full: string } {
  if (!userAgent || typeof userAgent !== 'string') {
    return { browser: 'Navigateur inconnu', os: 'Appareil inconnu', full: 'Appareil inconnu' };
  }

  let browser = 'Navigateur inconnu';
  if (userAgent.includes('Edg/')) {
    browser = 'Microsoft Edge';
  } else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) {
    browser = 'Opera';
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Chromium/')) {
    browser = 'Google Chrome';
  } else if (userAgent.includes('Firefox/')) {
    browser = 'Mozilla Firefox';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    browser = 'Apple Safari';
  }

  let os = 'Système inconnu';
  if (userAgent.includes('Windows NT 10.0')) {
    os = 'Windows 10/11';
  } else if (userAgent.includes('Windows')) {
    os = 'Windows';
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS';
  } else if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
    os = 'macOS';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
  }

  return {
    browser,
    os,
    full: `${browser} sur ${os}`,
  };
}

function formatDateFr(dateValue?: string | Date | null): string {
  if (!dateValue) return '—';
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return String(dateValue);
    return d.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dateValue);
  }
}

interface ActiveSessionsCardProps {
  sessions?: AdminSessionItem[];
  currentSessionId?: string;
}

export function ActiveSessionsCard({ sessions: initialSessions, currentSessionId }: ActiveSessionsCardProps) {
  const { data: sessionContext } = useSession();
  const currentToken = (sessionContext?.session as any)?.token;
  const currentId = currentSessionId || (sessionContext?.session as any)?.id;

  const [sessions, setSessions] = useState<AdminSessionItem[]>(initialSessions || []);
  const [loading, setLoading] = useState(!initialSessions);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (initialSessions) {
      setSessions(initialSessions);
      return;
    }

    async function fetchSessions() {
      setLoading(true);
      setError(null);
      try {
        const res = await listSessions();
        if (res.data) {
          setSessions(res.data as AdminSessionItem[]);
        } else if (res.error) {
          setError(res.error.message || 'Impossible de récupérer la liste des sessions.');
        }
      } catch (err: any) {
        setError(err?.message || 'Erreur lors du chargement des sessions.');
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, [initialSessions]);

  async function handleRevokeOne(session: AdminSessionItem) {
    setRevokingId(session.id);
    setError(null);
    setFeedback(null);

    try {
      const res = await revokeSession({ token: session.token });
      if (res.error) {
        setError(res.error.message || 'Échec de la révocation de la session.');
      } else {
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
        setFeedback('Session révoquée avec succès.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la révocation de la session.');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingAll(true);
    setError(null);
    setFeedback(null);

    try {
      const res = await revokeOtherSessions();
      if (res.error) {
        setError(res.error.message || 'Échec de la déconnexion des autres sessions.');
      } else {
        setSessions((prev) => prev.filter((s) => s.id === currentId || (currentToken && s.token === currentToken)));
        setFeedback('Toutes les autres sessions ont été déconnectées.');
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la déconnexion.');
    } finally {
      setRevokingAll(false);
    }
  }

  const otherSessionsCount = sessions.filter(
    (s) => s.id !== currentId && (!currentToken || s.token !== currentToken),
  ).length;

  return (
    <section
      className="card settings__section"
      aria-labelledby="settings-active-sessions"
      data-testid="active-sessions-card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '16px',
        padding: '20px 24px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <h2
          id="settings-active-sessions"
          className="settings__title"
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--ink, #141414)',
            margin: 0,
          }}
        >
          Sessions actives
        </h2>

        {otherSessionsCount > 0 && (
          <button
            type="button"
            data-testid="revoke-other-sessions-btn"
            onClick={handleRevokeOthers}
            disabled={revokingAll}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--red, #f61b39)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: revokingAll ? 'not-allowed' : 'pointer',
              opacity: revokingAll ? 0.6 : 1,
            }}
          >
            {revokingAll ? 'Déconnexion...' : 'Déconnecter toutes les autres sessions'}
          </button>
        )}
      </div>

      <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginBottom: '16px' }}>
        Liste des appareils et navigateurs actuellement connectés à votre compte administrateur REVIME.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--badge-danger-bg)',
            color: 'var(--red, #f61b39)',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '14px',
          }}
        >
          {error}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--badge-success-bg)',
            color: 'var(--green, #0e8345)',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '14px',
            fontWeight: 500,
          }}
        >
          {feedback}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Chargement des sessions actives...</p>
      ) : sessions.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Aucune session active enregistrée.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sessions.map((sess) => {
            const isCurrent = sess.id === currentId || (currentToken && sess.token === currentToken);
            const { full } = parseUserAgentDevice(sess.userAgent);
            const isBusy = revokingId === sess.id;

            return (
              <div
                key={sess.id}
                data-testid={`session-row-${sess.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  backgroundColor: isCurrent ? 'rgba(37, 50, 79, 0.03)' : 'var(--paper, #ffffff)',
                  border: isCurrent ? '1.5px solid var(--navy, #25324f)' : '1px solid var(--line, #dfe2e2)',
                  borderRadius: '12px',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                      {full}
                    </span>

                    {isCurrent && (
                      <span
                        data-testid="current-session-badge"
                        style={{
                          backgroundColor: 'var(--badge-success-bg)',
                          color: 'var(--badge-success-text)',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Cette session
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    <span>
                      <strong>IP :</strong> {sess.ipAddress || '—'}
                    </span>
                    <span>
                      <strong>Connexion :</strong> {formatDateFr(sess.createdAt)}
                    </span>
                    <span>
                      <strong>Dernière activité :</strong> {formatDateFr(sess.updatedAt || sess.createdAt)}
                    </span>
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    type="button"
                    data-testid={`revoke-session-${sess.id}`}
                    className="revoke-session-btn"
                    onClick={() => handleRevokeOne(sess)}
                    disabled={isBusy}
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--red, #f61b39)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isBusy ? 'Révocation...' : 'Révoquer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
