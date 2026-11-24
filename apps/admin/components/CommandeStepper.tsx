'use client';

import React from 'react';
import type {
  AdminCommandeTimelineItem,
  AdminCommandeDispute,
  AdminCommandeCancellation,
} from '@revime/shared';
import { cancellationStatusLabel, requesterRoleLabel } from '../lib/status-labels';
import { TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface CommandeStepperProps {
  timeline: AdminCommandeTimelineItem[];
  dispute?: AdminCommandeDispute | null;
  cancellation?: AdminCommandeCancellation | null;
}

export function formatMilestoneDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'En attente';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'En attente';
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'En attente';
  }
}

export function CommandeStepper({
  timeline = [],
  dispute = null,
  cancellation = null,
}: CommandeStepperProps) {
  const isDisputed = Boolean(dispute && (dispute.status === 'OPEN' || dispute.status === 'IN_REVIEW'));
  const isCancelled = Boolean(cancellation && cancellation.status === 'PENDING');

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '1rem' }}>
        Parcours de la commande
      </h2>

      {/* Warning banners for freeze states */}
      {isDisputed && dispute && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--badge-warning-bg)',
            border: '1px solid var(--badge-warning-border)',
            color: 'var(--badge-warning-text)',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '18px' }}><Icon as={TriangleAlert} /></span>
          <div>
            <strong>Litige ouvert ({dispute.disputeNumber}) :</strong> Les fonds sont gelés sous séquestre jusqu’à la résolution du dossier.
          </div>
        </div>
      )}

      {isCancelled && cancellation && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--badge-danger-bg)',
            border: '1px solid var(--badge-danger-border)',
            color: 'var(--badge-danger-text)',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '18px' }}><Icon as={TriangleAlert} /></span>
          <div>
            <strong>Demande d’annulation ({cancellationStatusLabel(cancellation.status)}) :</strong> Signalée par {requesterRoleLabel(cancellation.requesterRole)}.
          </div>
        </div>
      )}

      {/* Milestone timeline */}
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {timeline.map((item, index) => {
          const isCompleted = item.completed;
          const isCurrent = item.current;

          let iconBg = 'var(--badge-neutral-bg)';
          let iconColor = 'var(--muted, #6b7280)';
          let iconBorder = '1px solid var(--line, #dfe2e2)';
          let iconContent = '○';

          if (isCompleted) {
            iconBg = 'var(--badge-success-bg)';
            iconColor = 'var(--badge-success-text)';
            iconBorder = '1px solid var(--badge-success-border)';
            iconContent = '✓';
          } else if (isCurrent) {
            iconBg = 'var(--badge-info-bg)';
            iconColor = 'var(--navy, #25324f)';
            iconBorder = '2px solid var(--navy, #25324f)';
            iconContent = '●';
          }

          return (
            <li
              key={item.key || index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                position: 'relative',
              }}
            >
              {/* Milestone Icon */}
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: iconBg,
                  color: iconColor,
                  border: iconBorder,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isCurrent ? '12px' : '13px',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '1px',
                }}
                aria-hidden="true"
              >
                {iconContent}
              </div>

              {/* Milestone Text & Date */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: isCurrent ? 600 : isCompleted ? 500 : 400,
                    color: isCurrent ? 'var(--navy-text, #25324f)' : isCompleted ? 'var(--ink, #141414)' : 'var(--muted, #6b7280)',
                  }}
                >
                  {item.label}
                  {isCurrent && (
                    <span
                      style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--badge-info-bg)',
                        color: 'var(--navy-text, #25324f)',
                        fontWeight: 600,
                      }}
                    >
                      En cours
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted, #6b7280)',
                    marginTop: '2px',
                  }}
                >
                  {formatMilestoneDate(item.timestamp)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
