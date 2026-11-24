'use client';

import React from 'react';
import Link from 'next/link';
import { formatShortReference } from './CopyableReference';
import type { AdminConversationDetailResponse, AdminConversationMessageItem } from '@revime/shared';
import { Bell, FileText, MessageSquare, Package, Scale, Store, TriangleAlert, User, Wrench } from 'lucide-react';
import { Icon } from './Icon';

export interface ConversationMessageHistoryProps {
  conversation: AdminConversationDetailResponse | null;
  loading?: boolean;
  onCloseConversation?: (id: string) => Promise<void> | void;
  onReopenConversation?: (id: string) => Promise<void> | void;
  actionLoading?: boolean;
}

export function formatMessageDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(dateString);
  }
}

export function ConversationMessageHistory({
  conversation,
  loading = false,
  onCloseConversation,
  onReopenConversation,
  actionLoading = false,
}: ConversationMessageHistoryProps) {
  if (!conversation) {
    return (
      <div
        style={{
          background: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: '8px',
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--ink-muted, #737373)',
        }}
      >
        <div style={{ fontSize: '36px', marginBottom: '12px' }}><Icon as={MessageSquare} /></div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--ink, #141414)', fontSize: '16px' }}>
          Sélectionnez une conversation
        </h3>
        <p style={{ margin: 0, fontSize: '13px' }}>
          Choisissez une discussion dans la colonne de gauche pour afficher l&apos;historique complet
          des messages et les outils de modération.
        </p>
      </div>
    );
  }

  const isClosed = conversation.closed;

  return (
    <div
      style={{
        background: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: loading ? 0.7 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Moderation & Context Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          background: 'var(--paper, #ffffff)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '10px',
          }}
        >
          <div>
            <h2
              style={{
                margin: '0 0 4px',
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--ink, #141414)',
              }}
            >
              Échanges {conversation.client.name} ↔ {conversation.repairer.name}
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--ink-muted, #666666)' }}>
              Créée le {formatMessageDateTime(conversation.createdAt)} • {conversation.messages.length} messages
            </div>
          </div>

          {/* Moderation Action Button */}
          <div>
            {isClosed ? (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onReopenConversation?.(conversation.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: 'var(--navy, #25324f)',
                  color: '#ffffff',
                  border: '1px solid var(--navy, #25324f)',
                  cursor: actionLoading ? 'wait' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  transition: 'opacity 0.15s ease',
                }}
              >
                {actionLoading ? 'Action en cours...' : 'Rouvrir la conversation'}
              </button>
            ) : (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onCloseConversation?.(conversation.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: 'var(--paper, #ffffff)',
                  color: 'var(--navy-text, #f61b39)',
                  border: '1px solid var(--accent, #f61b39)',
                  cursor: actionLoading ? 'wait' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  transition: 'opacity 0.15s ease',
                }}
              >
                {actionLoading ? 'Action en cours...' : 'Fermer la conversation'}
              </button>
            )}
          </div>
        </div>

        {/* Linked Entity Badges & Profiles */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            fontSize: '12px',
          }}
        >
          {/* Client link */}
          <Link
            href={`/utilisateurs/${conversation.client.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line)',
              color: 'var(--navy-text, #25324f)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <Icon as={User} /> Client: {conversation.client.name}
          </Link>

          {/* Repairer link */}
          <Link
            href={`/utilisateurs/${conversation.repairer.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'var(--navy-soft, #f0f1f5)',
              border: '1px solid var(--badge-info-border)',
              color: 'var(--navy-text, #25324f)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <Icon as={Store} /> Réparateur: {conversation.repairer.name}
            {conversation.repairer.verified && ' ✓'}
          </Link>

          {/* Demande link */}
          {conversation.demande && (
            <Link
              href={`/demandes/${conversation.demande.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'var(--badge-success-bg)',
                border: '1px solid var(--badge-success-border)',
                color: 'var(--badge-success-text)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              <Icon as={Wrench} /> Demande: {conversation.demande.title}
            </Link>
          )}

          {/* Commande link */}
          {conversation.commande && (
            <Link
              href={`/commandes/${conversation.commande.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'var(--badge-info-bg)',
                border: '1px solid var(--badge-info-border)',
                color: 'var(--badge-info-text)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              <Icon as={Package} /> Commande {formatShortReference(conversation.commande.id)}
            </Link>
          )}

          {/* Dispute link if present */}
          {conversation.commande?.disputeId && (
            <Link
              href={`/litiges?disputeId=${conversation.commande.disputeId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'var(--badge-warning-bg)',
                border: '1px solid var(--badge-warning-border)',
                color: 'var(--badge-warning-text)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              <Icon as={Scale} /> Litige #{conversation.commande.disputeId.slice(0, 8)}
            </Link>
          )}

          {/* Status closed indicator */}
          {isClosed && (
            <span
              style={{
                background: 'var(--badge-danger-bg)',
                color: 'var(--navy-text, #f61b39)',
                border: '1px solid var(--badge-danger-border)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontWeight: 600,
              }}
            >
              Fermée le {formatMessageDateTime(conversation.closedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        style={{
          padding: '16px',
          maxHeight: '560px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          background: 'var(--badge-neutral-bg)',
        }}
      >
        {conversation.messages.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--ink-muted, #737373)',
              fontSize: '13px',
            }}
          >
            Aucun message dans cette conversation.
          </div>
        ) : (
          conversation.messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AdminConversationMessageItem }) {
  const isSystem = message.senderRole === 'SYSTEM' || message.kind === 'SYSTEM';
  const isClient = message.senderRole === 'CLIENT';
  const isRepairer = message.senderRole === 'REPAIRER';
  const isAdmin = message.senderRole === 'ADMIN';

  // System notice: centered gray notice
  if (isSystem) {
    return (
      <div
        style={{
          alignSelf: 'center',
          maxWidth: '85%',
          margin: '4px 0',
          padding: '8px 16px',
          borderRadius: '16px',
          background: 'var(--badge-neutral-bg)',
          border: '1px solid var(--line)',
          color: 'var(--ink2)',
          fontSize: '12px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '2px' }}>
          <Icon as={Bell} /> {message.senderName || 'Système'}
        </div>
        <div>{message.body}</div>
        <div style={{ fontSize: '10px', color: 'var(--faint)', marginTop: '2px' }}>
          {formatMessageDateTime(message.createdAt)}
        </div>
      </div>
    );
  }

  // Bubble style selection
  let bubbleBg = 'var(--paper, #ffffff)';
  let bubbleBorder = '1px solid var(--line, #dfe2e2)';
  let roleBadgeLabel = 'Utilisateur';
  let roleBadgeBg = 'var(--badge-neutral-bg)';
  let roleBadgeColor = 'var(--ink2)';
  let alignSelf: 'flex-start' | 'flex-end' = 'flex-start';

  if (isClient) {
    // Neutral card style
    bubbleBg = 'var(--paper, #ffffff)';
    bubbleBorder = '1px solid var(--line, #dfe2e2)';
    roleBadgeLabel = 'Client';
    roleBadgeBg = 'var(--badge-neutral-bg)';
    roleBadgeColor = 'var(--ink2)';
    alignSelf = 'flex-start';
  } else if (isRepairer) {
    // Soft blue card style with navy accent
    bubbleBg = 'var(--navy-soft, #f0f1f5)';
    bubbleBorder = '1px solid var(--line)';
    roleBadgeLabel = 'Réparateur';
    roleBadgeBg = 'var(--navy, #25324f)';
    roleBadgeColor = '#ffffff';
    alignSelf = 'flex-end';
  } else if (isAdmin) {
    bubbleBg = 'var(--badge-warning-bg)';
    bubbleBorder = '1px solid var(--badge-warning-border)';
    roleBadgeLabel = 'Admin';
    roleBadgeBg = 'var(--red-deep)';
    roleBadgeColor = '#ffffff';
    alignSelf = 'flex-start';
  }

  return (
    <div
      style={{
        alignSelf,
        maxWidth: '75%',
        background: bubbleBg,
        border: bubbleBorder,
        borderRadius: '8px',
        padding: '10px 12px',
        boxShadow: '0 1px 2px rgba(20, 20, 20, 0.04)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Bubble Header: Sender Name & Role Tag & Timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <strong style={{ fontSize: '12px', color: 'var(--ink, #141414)' }}>
            {message.senderName}
          </strong>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: '10px',
              background: roleBadgeBg,
              color: roleBadgeColor,
            }}
          >
            {roleBadgeLabel}
          </span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--ink-muted, #737373)' }}>
          {formatMessageDateTime(message.createdAt)}
        </span>
      </div>

      {/* Soft-deleted Message Notice */}
      {message.deleted && (
        <div
          style={{
            background: 'var(--badge-warning-bg)',
            border: '1px solid var(--badge-warning-border)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--badge-warning-text)',
            marginBottom: '6px',
          }}
        >
          <Icon as={TriangleAlert} /> [Message masqué par la modération le{' '}
          {formatMessageDateTime(message.deletedAt || message.createdAt)}]
        </div>
      )}

      {/* Message Body */}
      <div
        style={{
          fontSize: '13px',
          lineHeight: '1.45',
          color: message.deleted ? 'var(--ink-muted, #555555)' : 'var(--ink, #141414)',
          fontStyle: message.deleted ? 'italic' : 'normal',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.body}
      </div>

      {/* Photo Attachment Preview */}
      {message.photoUrl && (
        <div style={{ marginTop: '8px' }}>
          <a
            href={message.photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block' }}
          >
            <img
              src={message.photoUrl}
              alt="Photo jointe"
              style={{
                maxWidth: '240px',
                maxHeight: '180px',
                borderRadius: '6px',
                border: '1px solid var(--line, #dfe2e2)',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </a>
        </div>
      )}

      {/* Document Download Card */}
      {message.documentUrl && (
        <div style={{ marginTop: '8px' }}>
          <a
            href={message.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px',
              background: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--navy-text, #25324f)',
              textDecoration: 'none',
            }}
          >
            <span aria-hidden="true"><Icon as={FileText} /></span>
            <span>{message.documentName || 'Document téléchargé'}</span>
          </a>
        </div>
      )}
    </div>
  );
}
