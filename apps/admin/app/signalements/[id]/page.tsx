'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  DELETED_USER_NAME,
  REPORT_GRAVITY_LABEL,
  REPORT_REASON_LABEL,
  REPORT_RESOLUTION_VERDICT_LABEL,
  ADMIN_ROLE_LABEL,
  type AdminRole,
  type AdminReportDetailDto,
  type ReportGravity,
} from '@revime/shared';
import { useAdminMe } from '../../../components/AdminGate';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { ReportTargetPreview } from '../../../components/ReportTargetPreview';
import { hasPermission } from '../../../lib/permissions';
import { formatUserDisplay } from '../../../lib/user-display';
import { ResolveVerdictSelect } from '../../../components/ResolveVerdictSelect';
import { NO_VERDICT, parseVerdictChoice, type VerdictChoice } from '../../../lib/report-resolution';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../../components/Icon';

function formatReportedRole(role: string | null | undefined): string {
  if (!role) return 'Utilisateur';
  if (role in ADMIN_ROLE_LABEL) return ADMIN_ROLE_LABEL[role as AdminRole];
  if (role.toLowerCase() === 'client') return 'Client';
  if (role.toLowerCase() === 'repairer' || role.toLowerCase() === 'reparateur') return 'Réparateur';
  return role;
}

function GravityBadge({ gravity, label }: { gravity: ReportGravity; label?: string }) {
  const styles: Record<ReportGravity, { bg: string; color: string; border: string }> = {
    HIGH: {
      bg: 'var(--red-soft, #feedf0)',
      color: 'var(--red-text, #bd0e26)',
      border: '1px solid var(--badge-danger-border)',
    },
    MEDIUM: {
      bg: 'var(--amber-soft, #fef0c7)',
      color: 'var(--amber-deep, #b45309)',
      border: '1px solid var(--badge-warning-border)',
    },
    LOW: {
      bg: 'var(--badge-neutral-bg)',
      color: 'var(--ink2)',
      border: '1px solid var(--line)',
    },
  };
  const s = styles[gravity] ?? styles.LOW;
  const displayLabel = label || REPORT_GRAVITY_LABEL[gravity] || gravity;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        border: s.border,
        whiteSpace: 'nowrap',
      }}
    >
      {displayLabel}
    </span>
  );
}

function ReasonBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: 'var(--navy-soft, #f0f1f5)',
        color: 'var(--navy-text, #25324f)',
        border: '1px solid var(--line)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function ReportedUserStatusBadge({
  banned,
  repairerSuspended,
}: {
  banned: boolean;
  repairerSuspended: boolean;
}) {
  if (banned) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: 'var(--red-soft, #feedf0)',
          color: 'var(--red-text, #bd0e26)',
          border: '1px solid var(--badge-danger-border)',
          whiteSpace: 'nowrap',
        }}
      >
        Banni / Suspendu
      </span>
    );
  }
  if (repairerSuspended) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: 'var(--amber-soft, #fef0c7)',
          color: 'var(--amber-deep, #b45309)',
          border: '1px solid var(--badge-warning-border)',
          whiteSpace: 'nowrap',
        }}
      >
        Mode réparateur suspendu
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--green-soft, #e7f8f0)',
        color: 'var(--green-deep, #0a8a50)',
        border: '1px solid var(--badge-success-border)',
        whiteSpace: 'nowrap',
      }}
    >
      Actif
    </span>
  );
}

export default function SignalementDetailPage({
  initialReport,
}: {
  initialReport?: AdminReportDetailDto;
} = {}) {
  const params = useParams();
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id) as string | undefined;

  const [report, setReport] = useState<AdminReportDetailDto | null>(initialReport ?? null);
  const [loading, setLoading] = useState(!initialReport);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Action status (loading, error, success messages)
  const [actionBusy, setActionBusy] = useState(false);
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canModerate = hasPermission(adminMe, 'content.moderate');
  const canReports = hasPermission(adminMe, 'reports.handle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Clôture Modal State
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveVerdict, setResolveVerdict] = useState<VerdictChoice>(NO_VERDICT);
  const [resolveNote, setResolveNote] = useState('');
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Quick Sanction Modal State
  const [isSanctionModalOpen, setIsSanctionModalOpen] = useState(false);
  const [sanctionDuration, setSanctionDuration] = useState<'7' | '30' | '90' | 'permanent'>('7');
  const [sanctionReason, setSanctionReason] = useState('');
  const [sanctionBusy, setSanctionBusy] = useState(false);
  const [sanctionError, setSanctionError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const response = await fetch(`/api/proxy/admin/reports/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        setError('Ce signalement est introuvable.');
        setLoading(false);
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger les détails du signalement.');
        setLoading(false);
        return;
      }
      const data = (await response.json()) as AdminReportDetailDto;
      setReport(data);
    } catch {
      setError('Impossible de charger les détails du signalement.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!initialReport) {
      void loadReport();
    }
  }, [loadReport, initialReport]);

  // Handle ESC key to close open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isResolveModalOpen) setIsResolveModalOpen(false);
        if (isSanctionModalOpen) setIsSanctionModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isResolveModalOpen, isSanctionModalOpen]);

  // Generic write action helper
  async function performAction(
    path: string,
    method: 'PATCH' | 'POST' | 'DELETE',
    body: unknown,
    successMessage: string,
    confirmText?: string,
  ) {
    if (confirmText && !window.confirm(confirmText)) return;

    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(`/api/proxy/${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        message?: string;
      } | null;

      if (!response.ok) {
        setActionError(data?.error?.message ?? data?.message ?? 'Une erreur est survenue.');
        setActionBusy(false);
        return;
      }

      await loadReport();
      setActionSuccess(successMessage);
    } catch {
      setActionError('Une erreur réseau est survenue.');
    } finally {
      setActionBusy(false);
    }
  }

  // Channel Controls
  const handleCloseConversation = () => {
    if (!report) return;
    void performAction(
      `admin/conversations/${report.conversation.id}/close`,
      'PATCH',
      {},
      'La conversation a été fermée.',
      'Fermer cette conversation ? Les participants ne pourront plus échanger de messages.',
    );
  };

  const handleReopenConversation = () => {
    if (!report) return;
    void performAction(
      `admin/conversations/${report.conversation.id}/reopen`,
      'PATCH',
      {},
      'La conversation a été rouverte.',
    );
  };

  // Message Delete Control
  const handleDeleteMessage = (messageId: string) => {
    void performAction(
      `admin/messages/${messageId}/delete`,
      'PATCH',
      {},
      'Le message a été masqué par la modération.',
      'Masquer ce message ? Il ne sera plus visible par les participants.',
    );
  };

  // Assignment Controls
  const handleAssignReport = () => {
    if (!id) return;
    void performAction(
      `admin/reports/${id}/assign`,
      'PATCH',
      {},
      'Dossier pris en charge avec succès.',
    );
  };

  const handleUnassignReport = () => {
    if (!id) return;
    void performAction(
      `admin/reports/${id}/unassign`,
      'PATCH',
      {},
      'Dossier libéré avec succès.',
    );
  };

  // Clôture Modal Submit
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const verdict = parseVerdictChoice(resolveVerdict);
    if (!verdict) {
      setResolveError('Choisissez un verdict de clôture.');
      return;
    }

    setResolveBusy(true);
    setResolveError(null);

    try {
      const response = await fetch(`/api/proxy/admin/reports/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          verdict,
          note: resolveNote.trim() ? resolveNote.trim() : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        message?: string;
      } | null;

      if (!response.ok) {
        setResolveError(data?.error?.message ?? data?.message ?? 'Impossible de clôturer le signalement.');
        setResolveBusy(false);
        return;
      }

      setIsResolveModalOpen(false);
      setResolveNote('');
      setResolveVerdict(NO_VERDICT);
      setActionSuccess('Signalement clôturé avec succès.');
      await loadReport();
    } catch {
      setResolveError('Une erreur est survenue lors de la clôture.');
    } finally {
      setResolveBusy(false);
    }
  };

  // Quick Sanction Modal Submit
  const handleSanctionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report) return;

    const trimmedReason = sanctionReason.trim();
    if (trimmedReason.length < 3) {
      setSanctionError('Le motif doit comporter au moins 3 caractères.');
      return;
    }

    setSanctionBusy(true);
    setSanctionError(null);

    const body: { reason: string; until?: string } = {
      reason: trimmedReason,
    };

    if (sanctionDuration !== 'permanent') {
      const days = parseInt(sanctionDuration, 10);
      body.until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const response = await fetch(`/api/proxy/admin/users/${report.reported.id}/suspend`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        message?: string;
      } | null;

      if (!response.ok) {
        setSanctionError(data?.error?.message ?? data?.message ?? 'Impossible de suspendre le compte.');
        setSanctionBusy(false);
        return;
      }

      setIsSanctionModalOpen(false);
      setSanctionReason('');
      setActionSuccess('Utilisateur suspendu avec succès.');
      await loadReport();
    } catch {
      setSanctionError('Une erreur est survenue lors de la suspension.');
    } finally {
      setSanctionBusy(false);
    }
  };

  return (
    <div className="page page--detail" style={{ padding: '0 0 60px 0' }}>
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Signalements', href: '/signalements' },
          { label: report ? `Signalement #${report.id.slice(0, 8)}` : 'Dossier de signalement' },
        ]}
      />

      {/* Navigation & Back Link */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/signalements"
          style={{
            color: 'var(--muted)',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
          }}
        >
          ← Retour aux signalements
        </Link>
      </div>

      {/* Loading State */}
      {loading && <p>Chargement du dossier de modération...</p>}

      {/* Not Found or Error Alert */}
      {!loading && (error || notFound) && (
        <div role="alert" style={{ marginBottom: '24px' }}>
          <strong>Erreur : </strong> {error ?? 'Ressource introuvable.'}
        </div>
      )}

      {/* Global Action Feedback Alerts */}
      {actionError && (
        <div role="alert" style={{ marginBottom: '20px' }}>
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--green-soft, #e7f8f0)',
            color: 'var(--green-deep, #0a8a50)',
            border: '1px solid var(--badge-success-border)',
            borderRadius: 'var(--r-field, 4px)',
            fontSize: '14px',
            marginBottom: '20px',
            fontWeight: 500,
          }}
        >
          {actionSuccess}
        </div>
      )}

      {/* Main Content Area */}
      {!loading && report && (
        <>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              borderBottom: '1px solid var(--line)',
              paddingBottom: '20px',
              marginBottom: '24px',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span>Signalement #{report.id.slice(0, 8)}</span>
                <GravityBadge gravity={report.gravity} label={report.gravityLabel} />
                <ReasonBadge label={report.reasonLabel} />
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Reçu le {new Date(report.createdAt).toLocaleString('fr-FR')} · ID complet : {report.id}
              </p>
            </div>
          </div>

          {/* Multi-Entity Target Preview */}
          <ReportTargetPreview
            targetType={report.targetType ?? 'MESSAGE'}
            reportedMessage={
              report.likelyReportedMessageId
                ? report.conversation.messages.find((m) => m.id === report.likelyReportedMessageId)
                : null
            }
            targetEntitySummary={report.targetEntitySummary}
            reportedUser={report.reported}
            demande={report.conversation.demande}
          />

          {/* Two-Column Responsive Layout */}
          <div className="detail-grid">
            {/* Left Column: Transcript & Channel Controls */}
            <div>
              {/* Associated Demande Banner */}
              {report.conversation.demande && (
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'var(--navy-soft, #f0f1f5)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-field, 4px)',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>
                      Demande associée :{' '}
                    </span>
                    <strong style={{ color: 'var(--ink)' }}>{report.conversation.demande.title}</strong>
                  </div>
                  <Link
                    href={`/demandes/${report.conversation.demande.id}`}
                    style={{
                      color: 'var(--navy-text, #25324f)',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'underline',
                    }}
                  >
                    Voir la demande →
                  </Link>
                </div>
              )}

              {/* Channel Status Card */}
              <div className="card" style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: report.conversation.closed
                          ? 'var(--red-deep, #bd0e26)'
                          : 'var(--green-deep, #0a8a50)',
                      }}
                    />
                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>
                      {report.conversation.closed ? 'Conversation fermée' : 'Conversation active'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      ({report.conversation.messages.length} message
                      {report.conversation.messages.length > 1 ? 's' : ''})
                    </span>
                  </div>

                  <div>
                    {report.resolvedAt ? (
                      <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                        Actions désactivées (dossier résolu)
                      </span>
                    ) : report.conversation.closed ? (
                      <button hidden={!canModerate}
                        type="button"
                        onClick={handleReopenConversation}
                        disabled={actionBusy}
                        style={{
                          padding: '6px 14px',
                          fontSize: '13px',
                          fontWeight: 600,
                          backgroundColor: 'var(--navy, #25324f)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 'var(--r-field, 4px)',
                          cursor: 'pointer',
                        }}
                      >
                        Rouvrir la conversation
                      </button>
                    ) : (
                      <button hidden={!canModerate}
                        type="button"
                        onClick={handleCloseConversation}
                        disabled={actionBusy}
                        style={{
                          padding: '6px 14px',
                          fontSize: '13px',
                          fontWeight: 600,
                          backgroundColor: 'var(--red-soft, #feedf0)',
                          color: 'var(--red-text, #bd0e26)',
                          border: '1px solid var(--badge-danger-border)',
                          borderRadius: 'var(--r-field, 4px)',
                          cursor: 'pointer',
                        }}
                      >
                        Fermer la conversation
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Message Stream */}
              <div className="card">
                <h2
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    marginBottom: '16px',
                    color: 'var(--ink)',
                  }}
                >
                  Historique de la conversation
                </h2>

                {report.conversation.messages.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '14px', margin: 0 }}>
                    Aucun message dans cette conversation.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {report.conversation.messages.map((m) => {
                      // System messages (senderId == null)
                      if (m.senderId == null) {
                        return (
                          <div
                            key={m.id}
                            style={{
                              textAlign: 'center',
                              color: 'var(--muted)',
                              fontStyle: 'italic',
                              fontSize: '13px',
                              padding: '8px 16px',
                              backgroundColor: 'var(--badge-neutral-bg)',
                              borderRadius: 'var(--r-field, 4px)',
                              margin: '4px 0',
                            }}
                          >
                            <span>{m.body}</span>
                            <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.8 }}>
                              {new Date(m.createdAt).toLocaleString('fr-FR')}
                            </div>
                          </div>
                        );
                      }

                      // Client / Repairer bubbles
                      const isReporter = m.senderId === report.reporter.id;
                      const isReported = m.senderId === report.reported.id;
                      const isReportedMessage = Boolean(
                        report.likelyReportedMessageId && m.id === report.likelyReportedMessageId,
                      );

                      return (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: isReporter ? 'flex-start' : 'flex-end',
                          }}
                        >
                          {/* Sender Identity & Timestamp */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              color: 'var(--muted)',
                              marginBottom: '4px',
                              padding: '0 4px',
                            }}
                          >
                            <strong style={{ color: 'var(--ink)' }}>{m.senderName}</strong>
                            {isReporter && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--badge-info-bg)',
                                  color: 'var(--badge-info-text)',
                                  fontWeight: 600,
                                }}
                              >
                                Signalé par
                              </span>
                            )}
                            {isReported && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--badge-danger-bg)',
                                  color: 'var(--badge-danger-text)',
                                  fontWeight: 600,
                                }}
                              >
                                Personne signalée
                              </span>
                            )}
                            <span>· {new Date(m.createdAt).toLocaleString('fr-FR')}</span>
                          </div>

                          {/* Message Bubble */}
                          <div
                            data-testid={isReportedMessage ? 'reported-message-bubble' : undefined}
                            style={{
                              maxWidth: '85%',
                              padding: '12px 16px',
                              borderRadius: '8px',
                              backgroundColor: isReportedMessage
                                ? 'var(--red-soft, #feedf0)'
                                : m.deleted
                                  ? 'var(--badge-danger-bg)'
                                  : isReporter
                                    ? 'var(--badge-neutral-bg)'
                                    : 'var(--badge-info-bg)',
                              border: isReportedMessage
                                ? '2px solid var(--red-deep, #bd0e26)'
                                : m.deleted
                                  ? '1px dashed var(--badge-danger-border)'
                                  : '1px solid var(--line, #e5e7eb)',
                              color: 'var(--ink)',
                              fontSize: '14px',
                              lineHeight: 1.45,
                            }}
                          >
                            {isReportedMessage && (
                              <div style={{ marginBottom: '6px' }}>
                                <span
                                  data-testid="badge-message-signale"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    backgroundColor: 'var(--red-deep, #bd0e26)',
                                    color: '#ffffff',
                                  }}
                                >
                                  <Icon as={TriangleAlert} /> Message probablement signalé
                                </span>
                              </div>
                            )}

                            {m.deleted && (
                              <div style={{ marginBottom: '6px' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    backgroundColor: 'var(--red-soft, #feedf0)',
                                    color: 'var(--red-text, #bd0e26)',
                                    border: '1px solid var(--badge-danger-border)',
                                  }}
                                >
                                  Message masqué par la modération
                                </span>
                              </div>
                            )}

                            <div
                              style={{
                                textDecoration: m.deleted ? 'line-through' : 'none',
                                color: m.deleted ? 'var(--muted)' : 'inherit',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {m.body}
                            </div>

                            {/* Message Moderation Action */}
                            {!m.deleted && !report.resolvedAt && (
                              <div style={{ marginTop: '8px', textAlign: 'right' }}>
                                <button hidden={!canModerate}
                                  type="button"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  disabled={actionBusy}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--red-text, #bd0e26)',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    padding: '2px 4px',
                                    textDecoration: 'underline',
                                  }}
                                >
                                  Masquer ce message
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Dossier & Parties */}
            <div>
              {/* Resolution Summary Card (Terminal Controls Guard) */}
              {(report.resolvedAt || report.resolutionVerdict) && (
                <div
                  className="card card--resolution-summary"
                  data-testid="resolution-summary-card"
                  style={{
                    backgroundColor: 'var(--paper, #ffffff)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                      paddingBottom: '8px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                        Clôture du dossier
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: 'var(--green-soft, #e7f8f0)',
                          color: 'var(--green-deep, #0a8a50)',
                          border: '1px solid var(--badge-success-border)',
                        }}
                      >
                        Résolu
                      </span>
                    </div>
                    {report.resolutionVerdict && (
                      <span
                        data-testid="resolution-verdict-badge"
                        style={{
                          fontWeight: 600,
                          fontSize: '12px',
                          padding: '3px 10px',
                          borderRadius: '9999px',
                          backgroundColor: 'var(--badge-info-bg)',
                          color: 'var(--badge-info-text)',
                          border: '1px solid var(--badge-info-border)',
                        }}
                      >
                        {REPORT_RESOLUTION_VERDICT_LABEL[report.resolutionVerdict] ??
                          report.resolutionVerdictLabel ??
                          report.resolutionVerdict}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)' }}>Résolu par :</span>
                      <strong style={{ color: 'var(--ink)' }}>
                        {report.resolvedBy ? report.resolvedBy.name : '—'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)' }}>Date de résolution :</span>
                      <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                        {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString('fr-FR') : '—'}
                      </span>
                    </div>
                    {report.resolutionNote && (
                      <div
                        style={{
                          marginTop: '6px',
                          padding: '10px 12px',
                          backgroundColor: 'var(--badge-neutral-bg)',
                          borderRadius: 'var(--r-field, 4px)',
                          border: '1px solid var(--line, #dfe2e2)',
                        }}
                      >
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: '4px',
                            color: 'var(--muted)',
                            fontSize: '12px',
                          }}
                        >
                          Note de clôture :
                        </strong>
                        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)', fontSize: '13px' }}>
                          {report.resolutionNote}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dossier Card */}
              <div className="card" style={{ marginBottom: '24px' }}>
                <h2
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    marginBottom: '16px',
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--line)',
                    paddingBottom: '10px',
                  }}
                >
                  Dossier de modération
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
                  {/* Status & Received Date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)' }}>Statut :</span>
                    {report.resolvedAt ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: 'var(--green-soft, #e7f8f0)',
                          color: 'var(--green-deep, #0a8a50)',
                          border: '1px solid var(--badge-success-border)',
                        }}
                      >
                        Résolu
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: 'var(--navy-soft, #f0f1f5)',
                          color: 'var(--navy-text, #25324f)',
                          border: '1px solid var(--line)',
                        }}
                      >
                        En attente
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)' }}>Reçu le :</span>
                    <span style={{ fontWeight: 500 }}>
                      {new Date(report.createdAt).toLocaleString('fr-FR')}
                    </span>
                  </div>

                  {/* Assignment Controls */}
                  <div
                    style={{
                      borderTop: '1px solid var(--line)',
                      paddingTop: '12px',
                      marginTop: '4px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      {(() => {
                        const isAssigned = Boolean(
                          report.assignedTo &&
                          report.assignedTo.name !== DELETED_USER_NAME &&
                          report.assignedTo.name !== 'Opérateur supprimé'
                        );
                        return (
                          <>
                            <div>
                              <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Prise en charge :</div>
                              <div style={{ fontWeight: 600, marginTop: '2px' }}>
                                {isAssigned ? (
                                  <span style={{ color: 'var(--ink)' }}>
                                    Assigné à {report.assignedTo!.name}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                                    Non assigné
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              {report.resolvedAt ? (
                                <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                                  Dossier résolu
                                </span>
                              ) : isAssigned ? (
                                <button hidden={!canReports}
                                  type="button"
                                  onClick={handleUnassignReport}
                                  disabled={actionBusy}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    backgroundColor: 'var(--badge-neutral-bg)',
                                    color: 'var(--ink2)',
                                    border: '1px solid var(--line)',
                                    borderRadius: 'var(--r-field, 4px)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Libérer le dossier
                                </button>
                              ) : (
                                <button hidden={!canReports}
                                  type="button"
                                  onClick={handleAssignReport}
                                  disabled={actionBusy}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    backgroundColor: 'var(--navy, #25324f)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: 'var(--r-field, 4px)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Prendre en charge
                                </button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>


                  {/* Resolution Section */}
                  <div
                    style={{
                      borderTop: '1px solid var(--line)',
                      paddingTop: '12px',
                      marginTop: '4px',
                    }}
                  >
                    {report.resolvedAt ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--muted)' }}>Verdict :</span>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '12px',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: 'var(--badge-info-bg)',
                              color: 'var(--badge-info-text)',
                              border: '1px solid var(--badge-info-border)',
                            }}
                          >
                            {report.resolutionVerdictLabel ?? report.resolutionVerdict}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--muted)' }}>Résolu par :</span>
                          <span style={{ fontWeight: 500 }}>
                            {report.resolvedBy ? report.resolvedBy.name : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--muted)' }}>Résolu le :</span>
                          <span style={{ fontWeight: 500 }}>
                            {new Date(report.resolvedAt).toLocaleString('fr-FR')}
                          </span>
                        </div>
                        {report.resolutionNote && (
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '10px 12px',
                              backgroundColor: 'var(--badge-neutral-bg)',
                              borderRadius: 'var(--r-field, 4px)',
                              border: '1px solid var(--line)',
                              fontSize: '13px',
                            }}
                          >
                            <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--muted)' }}>
                              Note de clôture :
                            </strong>
                            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>
                              {report.resolutionNote}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setResolveError(null);
                            setIsResolveModalOpen(true);
                          }}
                          disabled={actionBusy}
                          style={{
                            width: '100%',
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: 600,
                            backgroundColor: 'var(--navy, #25324f)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 'var(--r-field, 4px)',
                            cursor: 'pointer',
                          }}
                        >
                          Clôturer le signalement
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Parties Card */}
              <div className="card">
                <h2
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    marginBottom: '16px',
                    color: 'var(--ink)',
                    borderBottom: '1px solid var(--line)',
                    paddingBottom: '10px',
                  }}
                >
                  Parties concernées
                </h2>

                {/* Reporter (Signalé par) */}
                <div style={{ marginBottom: '20px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--muted)',
                      fontWeight: 600,
                      marginBottom: '8px',
                    }}
                  >
                    Signalé par (Auteur)
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatUserDisplay(report.reporter.name, report.reporter.email).name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px' }}>{formatUserDisplay(report.reporter.name, report.reporter.email).email}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
                      Membre depuis le {new Date(report.reporter.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                    <div style={{ color: 'var(--ink)', fontSize: '13px', marginTop: '2px' }}>
                      Historique :{' '}
                      <strong>
                        {report.reporter.reportsCount} signalement
                        {report.reporter.reportsCount > 1 ? 's' : ''} émis
                      </strong>
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <Link
                        href={`/utilisateurs/${report.reporter.id}`}
                        style={{
                          color: 'var(--navy-text, #25324f)',
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'underline',
                        }}
                      >
                        Voir le compte →
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--line)', margin: '16px 0' }} />

                {/* Reported User (Personne signalée) */}
                <div>
                  <div
                    style={{
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--muted)',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Personne signalée</span>
                    <ReportedUserStatusBadge
                      banned={report.reported.banned}
                      repairerSuspended={report.reported.repairerSuspended}
                    />
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatUserDisplay(report.reported.name, report.reported.email).name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px' }}>{formatUserDisplay(report.reported.name, report.reported.email).email}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
                      Membre depuis le {new Date(report.reported.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
                      Rôle : <strong>{formatReportedRole(report.reported.role)}</strong>
                    </div>
                    <div style={{ color: 'var(--ink)', fontSize: '13px', marginTop: '2px' }}>
                      Historique :{' '}
                      <strong style={{ color: report.reported.reportsReceivedCount > 1 ? 'var(--red-text)' : 'inherit' }}>
                        {report.reported.reportsReceivedCount} signalement
                        {report.reported.reportsReceivedCount > 1 ? 's' : ''} reçu
                        {report.reported.reportsReceivedCount > 1 ? 's' : ''}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '12px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <Link
                        href={`/utilisateurs/${report.reported.id}`}
                        style={{
                          color: 'var(--navy-text, #25324f)',
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'underline',
                        }}
                      >
                        Voir le compte →
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setSanctionError(null);
                          setIsSanctionModalOpen(true);
                        }}
                        disabled={actionBusy}
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          backgroundColor: 'var(--red-soft, #feedf0)',
                          color: 'var(--red-text, #bd0e26)',
                          border: '1px solid var(--badge-danger-border)',
                          borderRadius: 'var(--r-field, 4px)',
                          cursor: 'pointer',
                        }}
                      >
                        Suspendre ce compte
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Clôture Modal */}
      {isResolveModalOpen && (
        <div
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
          }}
          onClick={() => setIsResolveModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloture-modal-title"
            style={{
              backgroundColor: 'var(--paper, #ffffff)',
              borderRadius: 'var(--r-card, 8px)',
              border: '1px solid var(--line, #e5e7eb)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cloture-modal-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              Clôturer le signalement
            </h2>

            {resolveError && (
              <div role="alert" style={{ marginBottom: '16px' }}>
                {resolveError}
              </div>
            )}

            <form hidden={!canReports} onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label
                  htmlFor="resolve-verdict-select"
                  style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}
                >
                  Verdict de clôture (obligatoire) :
                </label>
                <ResolveVerdictSelect
                  value={resolveVerdict}
                  onChange={setResolveVerdict}
                  disabled={resolveBusy}
                />
              </div>

              <div>
                <label
                  htmlFor="resolve-note-textarea"
                  style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}
                >
                  Note explicative (optionnelle, max 1000 car.) :
                </label>
                <textarea
                  id="resolve-note-textarea"
                  rows={4}
                  maxLength={1000}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder="Justification de la décision, mesures prises ou contexte..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line)',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                  }}
                  disabled={resolveBusy}
                />
                <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  {resolveNote.length} / 1000
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '8px',
                  borderTop: '1px solid var(--line)',
                  paddingTop: '16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsResolveModalOpen(false)}
                  disabled={resolveBusy}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    color: 'var(--ink2)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-field, 4px)',
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={resolveBusy || !parseVerdictChoice(resolveVerdict)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    backgroundColor: 'var(--navy, #25324f)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--r-field, 4px)',
                    cursor: 'pointer',
                  }}
                >
                  {resolveBusy ? 'Clôture en cours...' : 'Confirmer la clôture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Sanction Modal */}
      {isSanctionModalOpen && (
        <div
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
          }}
          onClick={() => setIsSanctionModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sanction-modal-title"
            style={{
              backgroundColor: 'var(--paper, #ffffff)',
              borderRadius: 'var(--r-card, 8px)',
              border: '1px solid var(--line, #e5e7eb)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sanction-modal-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
              Suspendre l&apos;utilisateur
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
              Compte ciblé : <strong>{report ? formatUserDisplay(report.reported.name, report.reported.email).name : ''}</strong>
              {report && formatUserDisplay(report.reported.name, report.reported.email).email
                ? ` (${formatUserDisplay(report.reported.name, report.reported.email).email})`
                : ''}
            </p>

            {sanctionError && (
              <div role="alert" style={{ marginBottom: '16px' }}>
                {sanctionError}
              </div>
            )}

            <form onSubmit={handleSanctionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label
                  htmlFor="sanction-duration-select"
                  style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}
                >
                  Durée de la suspension :
                </label>
                <select
                  id="sanction-duration-select"
                  value={sanctionDuration}
                  onChange={(e) =>
                    setSanctionDuration(e.target.value as '7' | '30' | '90' | 'permanent')
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line)',
                    fontSize: '14px',
                  }}
                  disabled={sanctionBusy}
                >
                  <option value="7">7 jours</option>
                  <option value="30">30 jours</option>
                  <option value="90">90 jours</option>
                  <option value="permanent">Définitive (permanente)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="sanction-reason-textarea"
                  style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}
                >
                  Motif de la suspension (obligatoire, min. 3 caractères) :
                </label>
                <textarea
                  id="sanction-reason-textarea"
                  rows={3}
                  maxLength={200}
                  value={sanctionReason}
                  onChange={(e) => setSanctionReason(e.target.value)}
                  placeholder="Ex : Propos diffamatoires répétés dans la messagerie..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--r-field, 4px)',
                    border: '1px solid var(--line)',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                  }}
                  disabled={sanctionBusy}
                />
                <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  {sanctionReason.trim().length} / 200 (min. 3)
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '8px',
                  borderTop: '1px solid var(--line)',
                  paddingTop: '16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsSanctionModalOpen(false)}
                  disabled={sanctionBusy}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    color: 'var(--ink2)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-field, 4px)',
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sanctionBusy || sanctionReason.trim().length < 3}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    backgroundColor: 'var(--red-deep, #bd0e26)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--r-field, 4px)',
                    cursor: sanctionReason.trim().length < 3 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sanctionBusy ? 'Suspension en cours...' : 'Confirmer la suspension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
