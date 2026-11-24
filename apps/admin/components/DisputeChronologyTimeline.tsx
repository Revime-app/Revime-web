'use client';

import { useState } from 'react';
import type { DisputeStatusType, DisputeTimelineEvent } from '@revime/shared';
import { DISPUTE_STATUS_LABEL, processingAgeLabel } from '../lib/dispute-status-label';
import { Flag, MessageSquare, PencilLine, Pin, Scale, Timer, User } from 'lucide-react';
import { Icon } from './Icon';
import type { LucideIcon } from 'lucide-react';

export interface DisputeChronologyTimelineProps {
  timeline: DisputeTimelineEvent[];
  processingTimeDays: number;
  disputeStatus: string;
  onAddNote?: (noteText: string) => Promise<void>;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function getEventIcon(type: DisputeTimelineEvent['type']): LucideIcon {
  switch (type) {
    case 'DISPUTE_OPENED':
      return Flag;
    case 'ASSIGNED':
    case 'UNASSIGNED':
      return User;
    case 'NOTE_ADDED':
      return PencilLine;
    case 'MESSAGE_EXCHANGED':
      return MessageSquare;
    case 'ARBITRATION_SUBMITTED':
    case 'DISPUTE_RESOLVED':
      return Scale;
    default:
      return Pin;
  }
}

function getEventTitle(type: DisputeTimelineEvent['type']): string {
  switch (type) {
    case 'DISPUTE_OPENED':
      return 'Ouverture du litige';
    case 'ASSIGNED':
      return 'Prise en charge';
    case 'UNASSIGNED':
      return 'Désassignation';
    case 'NOTE_ADDED':
      return 'Note interne administrative';
    case 'MESSAGE_EXCHANGED':
      return 'Message dans les espaces d’échange';
    case 'ARBITRATION_SUBMITTED':
      return 'Dossier transmis en arbitrage';
    case 'DISPUTE_RESOLVED':
      return 'Résolution & Arbitrage';
    default:
      return 'Événement';
  }
}

function getRoleBadge(role?: 'ADMIN' | 'CLIENT' | 'REPAIRER' | 'SYSTEM' | null) {
  switch (role) {
    case 'ADMIN':
      return { label: 'Admin / Support', bg: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: 'var(--badge-success-border)' };
    case 'CLIENT':
      return { label: 'Client', bg: 'var(--badge-info-bg)', color: 'var(--badge-info-text)', border: 'var(--badge-info-border)' };
    case 'REPAIRER':
      return { label: 'Réparateur', bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)' };
    case 'SYSTEM':
      return { label: 'Système', bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)' };
    default:
      return { label: 'Intervenant', bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)' };
  }
}

export function DisputeChronologyTimeline({
  timeline,
  processingTimeDays,
  disputeStatus,
  onAddNote,
}: DisputeChronologyTimelineProps) {
  const closed = disputeStatus.startsWith('RESOLVED_');
  const [quickNote, setQuickNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Processing age tone badge: green <= 3 days, amber <= 7 days, red > 7 days
  let ageBadge = {
    bg: 'var(--badge-success-bg)',
    color: 'var(--badge-success-text)',
    border: 'var(--badge-success-border)',
    dot: 'var(--badge-success-text)',
  };
  if (processingTimeDays > 7) {
    ageBadge = {
      bg: 'var(--red-soft, #feedf0)',
      color: 'var(--red-text, #bd0e26)',
      border: 'var(--badge-danger-border)',
      dot: 'var(--badge-danger-text)',
    };
  } else if (processingTimeDays > 3) {
    ageBadge = {
      bg: 'var(--badge-warning-bg)',
      color: 'var(--badge-warning-text)',
      border: 'var(--badge-warning-border)',
      dot: 'var(--badge-warning-text)',
    };
  }

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddNote || quickNote.trim().length < 2 || isSubmitting) return;

    setIsSubmitting(true);
    setNoteError(null);
    try {
      await onAddNote(quickNote.trim());
      setQuickNote('');
    } catch (err: any) {
      setNoteError(err?.message || "Une erreur est survenue lors de l'enregistrement de la note.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="dispute-chronology-timeline"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      {/* Processing age header card */}
      <div
        data-testid="processing-age-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 18px',
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}><Icon as={Timer} /></span>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy-deep-text, #1e293b)' }}>
              Délai de traitement du dossier
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
              Statut actuel : {DISPUTE_STATUS_LABEL[disputeStatus as DisputeStatusType] ?? disputeStatus}
            </div>
          </div>
        </div>

        <div
          data-testid="processing-age-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '9999px',
            backgroundColor: ageBadge.bg,
            color: ageBadge.color,
            border: `1px solid ${ageBadge.border}`,
            fontSize: '13px',
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: ageBadge.dot,
              display: 'inline-block',
            }}
          />
          {processingAgeLabel(processingTimeDays, closed)}
        </div>
      </div>

      {/* Note submission box if onAddNote is provided */}
      {onAddNote && (
        <form
          onSubmit={handleNoteSubmit}
          style={{
            padding: '16px',
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <label
            htmlFor="timeline-quick-note"
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-deep-text, #1e293b)' }}
          >
            Ajouter une note à la chronologie
          </label>

          {noteError && (
            <div
              role="alert"
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--red-soft, #feedf0)',
                color: 'var(--red-text, #bd0e26)',
                borderRadius: 'var(--r-field, 4px)',
                fontSize: '13px',
              }}
            >
              {noteError}
            </div>
          )}

          <textarea
            id="timeline-quick-note"
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            disabled={isSubmitting}
            rows={2}
            placeholder="Consigner un échange téléphonique, une relance transporteur..."
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '13px',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
              backgroundColor: 'var(--paper)',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={quickNote.trim().length < 2 || isSubmitting}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                cursor: quickNote.trim().length < 2 || isSubmitting ? 'not-allowed' : 'pointer',
                opacity: quickNote.trim().length < 2 || isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? 'Enregistrement…' : 'Ajouter la note'}
            </button>
          </div>
        </form>
      )}

      {/* Timeline entries list */}
      <div
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 8px)',
          padding: '20px 24px',
        }}
      >
        <h4
          style={{
            margin: '0 0 16px 0',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--navy-deep-text, #1e293b)',
          }}
        >
          Chronologie unifiée des événements ({timeline.length})
        </h4>

        {timeline.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--muted, #6b7280)',
              fontSize: '13px',
            }}
          >
            Aucun événement enregistré sur ce litige.
          </div>
        ) : (
          <div
            role="list"
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {/* Continuous vertical line */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '16px',
                bottom: '16px',
                left: '18px',
                width: '2px',
                backgroundColor: 'var(--line, #dfe2e2)',
                zIndex: 0,
              }}
            />

            {timeline.map((event, idx) => {
              const icon = getEventIcon(event.type);
              const title = getEventTitle(event.type);
              const roleBadge = getRoleBadge(event.actorRole);

              return (
                <div
                  key={event.id || idx}
                  role="listitem"
                  data-testid={`timeline-event-${event.type}`}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    zIndex: 1,
                  }}
                >
                  {/* Icon circle */}
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--paper, #ffffff)',
                      border: '2px solid var(--line, #dfe2e2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <Icon as={icon} />
                  </div>

                  {/* Content body */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--badge-neutral-bg)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-card, 8px)',
                      padding: '12px 16px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--navy-deep-text, #1e293b)',
                          }}
                        >
                          {title}
                        </span>

                        {event.actorName && (
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--navy-deep-text, #1e293b)',
                            }}
                          >
                            par {event.actorName}
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            backgroundColor: roleBadge.bg,
                            color: roleBadge.color,
                            border: `1px solid ${roleBadge.border}`,
                          }}
                        >
                          {roleBadge.label}
                        </span>
                      </div>

                      <time
                        dateTime={event.timestamp}
                        style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}
                      >
                        {formatDate(event.timestamp)}
                      </time>
                    </div>

                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--navy-deep-text, #1e293b)',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {event.summary}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
