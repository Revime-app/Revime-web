'use client';

import React from 'react';
import Link from 'next/link';
import type { ReportTargetEntitySummary, ReportTargetType } from '@revime/shared';
import { formatUserDisplay } from '../lib/user-display';
import { TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface ReportTargetPreviewProps {
  targetType: ReportTargetType;
  reportedMessage?: {
    id: string;
    body: string;
    senderName: string;
    createdAt: string;
  } | null;
  targetEntitySummary?: ReportTargetEntitySummary | null;
  reportedUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
    banned: boolean;
    repairerSuspended: boolean;
    reportsReceivedCount: number;
  } | null;
  demande?: {
    id: string;
    title: string;
  } | null;
}

export function ReportTargetPreview({
  targetType,
  reportedMessage,
  targetEntitySummary,
  reportedUser,
  demande,
}: ReportTargetPreviewProps) {
  if (targetType === 'MESSAGE') {
    const senderName =
      reportedMessage?.senderName ||
      targetEntitySummary?.title?.replace(/^Message de\s*/i, '') ||
      reportedUser?.name ||
      'Auteur du message';
    const bodyText =
      reportedMessage?.body ||
      targetEntitySummary?.description ||
      'Contenu du message signalé indisponible.';
    const dateStr = reportedMessage?.createdAt
      ? new Date(reportedMessage.createdAt).toLocaleString('fr-FR')
      : null;

    return (
      <div
        className="card card--report-target-preview card--target-message"
        data-testid="report-target-message"
        style={{
          border: '2px solid var(--red-deep, #bd0e26)',
          backgroundColor: 'var(--red-soft, #feedf0)',
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
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span aria-hidden="true" style={{ fontSize: '18px' }}>
              <Icon as={TriangleAlert} />
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: 'var(--red-deep, #bd0e26)',
                color: '#ffffff',
                whiteSpace: 'nowrap',
              }}
            >
              Message probablement signalé
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
              {senderName}
            </span>
          </div>
          {dateStr && (
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{dateStr}</span>
          )}
        </div>
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--paper, #ffffff)',
            borderRadius: '6px',
            border: '1px solid var(--line, #dfe2e2)',
            fontSize: '14px',
            lineHeight: 1.5,
            color: 'var(--ink)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {bodyText}
        </div>
      </div>
    );
  }

  if (targetType === 'USER') {
    const userId = targetEntitySummary?.id || reportedUser?.id || '';
    const { name: userName, email: safeEmail } = formatUserDisplay(
      targetEntitySummary?.name || reportedUser?.name,
      targetEntitySummary?.email || reportedUser?.email,
      'Utilisateur',
    );
    const userEmail = safeEmail ?? '';
    const userRole = targetEntitySummary?.role || reportedUser?.role || 'Utilisateur';
    const isBanned = Boolean(reportedUser?.banned);
    const isSuspended = Boolean(reportedUser?.repairerSuspended);
    const reportsCount = reportedUser?.reportsReceivedCount ?? 0;

    return (
      <div
        className="card card--report-target-preview card--target-user"
        data-testid="report-target-user"
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
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
              }}
            >
              Profil utilisateur signalé
            </span>
          </div>
          {userId && (
            <Link
              href={`/utilisateurs/${userId}`}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                textDecoration: 'underline',
              }}
            >
              Voir la fiche utilisateur →
            </Link>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--navy-soft, #f0f1f5)',
              color: 'var(--navy-text, #25324f)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '18px',
              flexShrink: 0,
            }}
          >
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{userName}</strong>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'var(--badge-neutral-bg)',
                  color: 'var(--ink2)',
                }}
              >
                {userRole}
              </span>
              {isBanned ? (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'var(--red-soft, #feedf0)',
                    color: 'var(--red-text, #bd0e26)',
                    border: '1px solid var(--badge-danger-border)',
                  }}
                >
                  Banni / Suspendu
                </span>
              ) : isSuspended ? (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'var(--amber-soft, #fef0c7)',
                    color: 'var(--amber-deep, #b45309)',
                    border: '1px solid var(--badge-warning-border)',
                  }}
                >
                  Réparateur suspendu
                </span>
              ) : (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'var(--green-soft, #e7f8f0)',
                    color: 'var(--green-deep, #0a8a50)',
                    border: '1px solid var(--badge-success-border)',
                  }}
                >
                  Actif
                </span>
              )}
            </div>
            {userEmail && (
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
                {userEmail}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--ink)', marginTop: '4px' }}>
              Signalements reçus : <strong>{reportsCount}</strong>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (targetType === 'REVIEW') {
    const rating = targetEntitySummary?.rating ?? 1;
    const authorName = targetEntitySummary?.authorName || 'Client';
    const repairerName = targetEntitySummary?.repairerName || 'Réparateur';
    const commentText = targetEntitySummary?.comment || targetEntitySummary?.description || '';

    const starsFilled = Math.max(1, Math.min(5, Math.round(rating)));
    const starsEmpty = Math.max(0, 5 - starsFilled);

    return (
      <div
        className="card card--report-target-preview card--target-review"
        data-testid="report-target-review"
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
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
              }}
            >
              Avis signalé
            </span>
            <span style={{ fontSize: '14px', color: 'var(--badge-warning-text)', fontWeight: 600 }}>
              {'★'.repeat(starsFilled)}
              {'☆'.repeat(starsEmpty)}
              <span style={{ color: 'var(--ink)', marginLeft: '4px', fontSize: '13px' }}>
                ({rating}/5)
              </span>
            </span>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Par <strong>{authorName}</strong> pour <strong>{repairerName}</strong>
          </span>
        </div>
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: '6px',
            border: '1px solid var(--line, #dfe2e2)',
            fontSize: '14px',
            lineHeight: 1.5,
            color: 'var(--ink)',
            fontStyle: 'italic',
          }}
        >
          « {commentText || 'Aucun commentaire textuel.'} »
        </div>
      </div>
    );
  }

  if (targetType === 'DEMANDE') {
    const demandeId = targetEntitySummary?.id || demande?.id || '';
    const demandeTitle = targetEntitySummary?.title || demande?.title || 'Demande signalée';
    const demandeDescription = targetEntitySummary?.description || '';

    return (
      <div
        className="card card--report-target-preview card--target-demande"
        data-testid="report-target-demande"
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
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 700,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
              }}
            >
              Demande signalée
            </span>
          </div>
          {demandeId && (
            <Link
              href={`/demandes/${demandeId}`}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--navy-text, #25324f)',
                textDecoration: 'underline',
              }}
            >
              Voir la fiche demande →
            </Link>
          )}
        </div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
          {demandeTitle}
        </div>
        {demandeDescription && (
          <div
            style={{
              fontSize: '13px',
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            {demandeDescription}
          </div>
        )}
      </div>
    );
  }

  return null;
}
