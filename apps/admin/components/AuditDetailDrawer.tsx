'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  type AdminAuditDetailedEntry,
  ADMIN_AUDIT_DOMAINS,
} from '@revime/shared';
import {
  formatAuditDate,
  getDomainBadge,
  getStatusBadge,
  getTargetLink,
} from './AuditLogTable';
import { Check, Copy } from 'lucide-react';
import { Icon } from './Icon';

export interface AuditDetailDrawerProps {
  entry: AdminAuditDetailedEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AuditDetailDrawer({
  entry,
  isOpen,
  onClose,
}: AuditDetailDrawerProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !entry) return null;

  const domainBadge = getDomainBadge(entry.domain);
  const statusBadge = getStatusBadge(entry.statusCode);
  const targetLink = getTargetLink(entry.targetType, entry.targetId);
  const domainLabel = ADMIN_AUDIT_DOMAINS[entry.domain]?.label ?? entry.domain;

  const hasDetail =
    entry.detail !== null &&
    entry.detail !== undefined &&
    typeof entry.detail === 'object' &&
    Object.keys(entry.detail).length > 0;

  const jsonString = hasDetail ? JSON.stringify(entry.detail, null, 2) : '';

  const handleCopyJson = () => {
    if (!jsonString) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(jsonString).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        data-testid="audit-drawer-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(2px)',
          zIndex: 1100,
          transition: 'opacity 0.2s ease',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
        data-testid="audit-detail-drawer"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '640px',
          height: '100%',
          backgroundColor: 'var(--paper, #ffffff)',
          zIndex: 1101,
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--line, #dfe2e2)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            backgroundColor: 'var(--paper)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: '9999px',
                  backgroundColor: domainBadge.bg,
                  color: domainBadge.color,
                  border: `1px solid ${domainBadge.border}`,
                }}
              >
                {domainBadge.label}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                {formatAuditDate(entry.createdAt)}
              </span>
            </div>
            <h2
              id="audit-detail-title"
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--ink, #141414)',
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {entry.actionLabel}
            </h2>
            <div
              style={{
                fontSize: '11.5px',
                fontFamily: 'monospace',
                color: 'var(--muted, #6b7280)',
                marginTop: '2px',
              }}
            >
              ID: {entry.id}
            </div>
          </div>

          <button
            type="button"
            data-testid="audit-detail-close-btn"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: 'var(--muted, #6b7280)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Drawer Body */}
        <div
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            flex: '1 1 auto',
          }}
        >
          {/* Metadata Summary Grid */}
          <div
            data-testid="audit-detail-metadata-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              padding: '16px',
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-card, 8px)',
            }}
          >
            {/* Opérateur */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--muted, #6b7280)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Opérateur
              </div>
              <div
                data-testid="audit-detail-actor-email"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  marginTop: '4px',
                  wordBreak: 'break-all',
                }}
              >
                {entry.actorEmail}
              </div>
              {entry.actorRole && (
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--badge-neutral-border)',
                    color: 'var(--ink2)',
                    marginTop: '4px',
                  }}
                >
                  {entry.actorRole}
                </span>
              )}
            </div>

            {/* Domaine & Code Action */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--muted, #6b7280)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Domaine
              </div>
              <div
                data-testid="audit-detail-domain"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  marginTop: '4px',
                }}
              >
                {domainLabel}
              </div>
              <div
                data-testid="audit-detail-action"
                style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: 'var(--muted, #6b7280)',
                  marginTop: '2px',
                }}
              >
                {entry.action}
              </div>
            </div>

            {/* Code HTTP */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--muted, #6b7280)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Code HTTP
              </div>
              <div style={{ marginTop: '4px' }}>
                <span
                  data-testid="audit-detail-status-code"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: statusBadge.bg,
                    color: statusBadge.color,
                    border: `1px solid ${statusBadge.border}`,
                  }}
                >
                  {entry.statusCode}
                </span>
              </div>
            </div>

            {/* Cible */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--muted, #6b7280)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Cible
              </div>
              <div
                data-testid="audit-detail-target"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--ink, #141414)',
                  marginTop: '4px',
                }}
              >
                {entry.targetType ? `${entry.targetType} #${entry.targetId ?? '—'}` : 'Aucune'}
              </div>
              {targetLink && (
                <div style={{ marginTop: '6px' }}>
                  <Link
                    href={targetLink}
                    data-testid="audit-detail-target-link"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--navy-text, #25324f)',
                      textDecoration: 'underline',
                    }}
                  >
                    Accéder à {entry.targetType} →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Details / Payload Section */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--ink, #141414)',
                  margin: 0,
                }}
              >
                Détails de l'événement (Payload JSON)
              </h3>
              {hasDetail && (
                <button
                  type="button"
                  data-testid="audit-detail-copy-json-btn"
                  onClick={handleCopyJson}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: 'var(--paper, #ffffff)',
                    color: 'var(--navy-text, #25324f)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: 'var(--r-field, 4px)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon as={copied ? Check : Copy} />
                  <span>{copied ? 'Copié !' : 'Copier le JSON'}</span>
                </button>
              )}
            </div>

            {hasDetail ? (
              <pre
                data-testid="audit-detail-json-pre"
                style={{
                  margin: 0,
                  padding: '14px 16px',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 6px)',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  lineHeight: 1.5,
                  color: 'var(--ink, #141414)',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: '360px',
                }}
              >
                {jsonString}
              </pre>
            ) : (
              <div
                data-testid="audit-detail-empty-json"
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  backgroundColor: 'var(--badge-neutral-bg)',
                  border: '1px dashed var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-field, 6px)',
                  color: 'var(--muted, #6b7280)',
                  fontSize: '13px',
                }}
              >
                Aucun détail enregistré pour cet événement.
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--paper)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
          }}
        >
          <button
            type="button"
            data-testid="audit-detail-footer-close-btn"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--paper, #ffffff)',
              color: 'var(--navy-text, #25324f)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </>
  );
}
