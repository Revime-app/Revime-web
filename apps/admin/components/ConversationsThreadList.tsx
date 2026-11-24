'use client';

import React from 'react';
import type { AdminConversationSummaryItem } from '@revime/shared';
import { MessageSquare, Wrench } from 'lucide-react';
import { Icon } from './Icon';

export interface ConversationsThreadListProps {
  threads: AdminConversationSummaryItem[];
  selectedId: string | null;
  onSelectThread: (id: string) => void;
  page: number;
  total: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  loading?: boolean;
}

export function formatThreadDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(dateString);
  }
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ConversationsThreadList({
  threads,
  selectedId,
  onSelectThread,
  page,
  total,
  limit,
  onPageChange,
  loading = false,
}: ConversationsThreadListProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div
      style={{
        background: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Scrollable list */}
      <div
        style={{
          maxHeight: '620px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          opacity: loading ? 0.6 : 1,
          transition: 'opacity 0.15s ease',
        }}
      >
        {threads.length === 0 ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--ink-muted, #737373)',
              fontSize: '13px',
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}><Icon as={MessageSquare} /></div>
            <strong>Aucune conversation trouvée.</strong>
            <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
              Modifiez vos filtres ou effectuez une recherche différente.
            </p>
          </div>
        ) : (
          threads.map((thread) => {
            const isSelected = selectedId === thread.id;
            const clientInitials = getInitials(thread.client.name);
            const repairerInitials = getInitials(thread.repairer.name);

            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: isSelected ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  border: 'none',
                  borderBottom: '1px solid var(--line, #dfe2e2)',
                  borderLeft: isSelected
                    ? '4px solid var(--navy, #25324f)'
                    : '4px solid transparent',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  position: 'relative',
                }}
              >
                {/* Header row: Participants & Date */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    {/* Avatars */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--paper, #ffffff)',
                          border: '1px solid var(--line, #dfe2e2)',
                          color: 'var(--navy-text, #25324f)',
                          fontSize: '10px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={`Client: ${thread.client.name}`}
                      >
                        {clientInitials}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--ink-muted, #888888)' }}>↔</span>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--navy, #25324f)',
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={`Réparateur: ${thread.repairer.name}`}
                      >
                        {repairerInitials}
                      </span>
                    </div>

                    <span
                      style={{
                        fontWeight: isSelected ? 700 : 600,
                        fontSize: '13px',
                        color: 'var(--ink, #141414)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {`${thread.client.name} ↔ ${thread.repairer.name}`}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--ink-muted, #737373)',
                      whiteSpace: 'nowrap',
                      marginLeft: '8px',
                    }}
                  >
                    {formatThreadDate(thread.lastMessageAt || thread.createdAt)}
                  </span>
                </div>

                {/* Demande Badge if available */}
                {thread.demande && (
                  <div style={{ marginBottom: '6px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: 'var(--navy-text, #25324f)',
                        background: 'var(--navy-soft, #f0f1f5)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                      }}
                    >
                      <Icon as={Wrench} /> {thread.demande.title}
                    </span>
                  </div>
                )}

                {/* Latest message snippet */}
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--ink-muted, #555555)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: '8px',
                  }}
                >
                  {thread.lastMessage ? (
                    <span>
                      <strong style={{ color: 'var(--ink, #141414)' }}>
                        {thread.lastMessage.senderName}:{' '}
                      </strong>
                      {thread.lastMessage.body}
                    </span>
                  ) : (
                    <em style={{ color: 'var(--ink-muted, #888888)' }}>Aucun message</em>
                  )}
                </div>

                {/* Badges footer: Status indicators & Messages Count */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {thread.closed && (
                      <span
                        style={{
                          background: 'var(--badge-neutral-bg)',
                          color: 'var(--ink2)',
                          border: '1px solid var(--line)',
                          borderRadius: '12px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        Fermée
                      </span>
                    )}
                    {thread.hasDispute && (
                      <span
                        style={{
                          background: 'var(--badge-warning-bg)',
                          color: 'var(--badge-warning-text)',
                          border: '1px solid var(--badge-warning-border)',
                          borderRadius: '12px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        Litige
                      </span>
                    )}
                    {thread.hasReport && (
                      <span
                        style={{
                          background: 'var(--badge-danger-bg)',
                          color: 'var(--navy-text, #f61b39)',
                          border: '1px solid var(--badge-danger-border)',
                          borderRadius: '12px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        Signalée
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--ink-muted, #737373)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {`${thread.messagesCount} msg`}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderTop: '1px solid var(--line, #dfe2e2)',
          background: 'var(--paper, #ffffff)',
          fontSize: '12px',
          color: 'var(--ink, #141414)',
        }}
      >
        <span>{`Page ${page} sur ${totalPages}`}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--line, #dfe2e2)',
              background: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.5 : 1,
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            Précédent
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--line, #dfe2e2)',
              background: 'var(--paper, #ffffff)',
              color: 'var(--ink, #141414)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.5 : 1,
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
