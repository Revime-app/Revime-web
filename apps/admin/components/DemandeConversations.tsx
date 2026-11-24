'use client';

import { useState } from 'react';
import type { AdminDemandeConversationThread } from '@revime/shared';

export interface DemandeConversationsProps {
  conversations?: AdminDemandeConversationThread[];
  initialThreadId?: string;
}

export function formatFrenchDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const months = [
      'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
      'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'
    ];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} à ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

export function DemandeConversations({ conversations = [], initialThreadId }: DemandeConversationsProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string>(
    initialThreadId ?? conversations[0]?.id ?? ''
  );

  if (conversations.length === 0) {
    return (
      <div className="card" style={{ marginBottom: '1.5rem' }} data-testid="demande-conversations-card">
        <h2 style={{ fontSize: '18px', marginBottom: '1rem' }}>Messagerie</h2>
        <p data-testid="demande-conversations-empty" style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic', margin: 0 }}>
          Aucun échange de messagerie pour cette demande
        </p>
      </div>
    );
  }

  const activeThread =
    conversations.find((t) => t.id === selectedThreadId) ?? conversations[0];

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }} data-testid="demande-conversations-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontSize: '18px', margin: 0 }}>Messagerie</h2>
        {conversations.length > 1 && (
          <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            {`${conversations.length} fils de discussion`}
          </span>
        )}
      </div>

      {/* Tabs if multiple repairers */}
      {conversations.length > 1 && (
        <div
          role="tablist"
          aria-label="Fils de discussion par réparateur"
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '1rem',
            overflowX: 'auto',
            paddingBottom: '4px',
          }}
        >
          {conversations.map((thread) => {
            const isSelected = thread.id === activeThread.id;
            return (
              <button
                key={thread.id}
                role="tab"
                aria-selected={isSelected}
                type="button"
                onClick={() => setSelectedThreadId(thread.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--navy, #25324f)' : '1px solid var(--line, #dfe2e2)',
                  backgroundColor: isSelected ? 'var(--navy, #25324f)' : 'var(--paper, #ffffff)',
                  color: isSelected ? '#ffffff' : 'var(--navy-text, #25324f)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{thread.repairerName}</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--line, #dfe2e2)',
                    color: isSelected ? '#ffffff' : 'var(--navy-text, #25324f)',
                  }}
                >
                  {thread.messages.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Thread messages */}
      {activeThread.messages.length === 0 ? (
        <p style={{ color: 'var(--muted, #6b7280)', fontStyle: 'italic', margin: 0 }}>
          Aucun message dans cette conversation
        </p>
      ) : (
        <div
          data-testid="conversation-messages-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: '480px',
            overflowY: 'auto',
            padding: '8px 4px',
          }}
        >
          {activeThread.messages.map((msg) => {
            const isClient = msg.senderRole === 'CLIENT';
            const isSystem = msg.senderRole === 'SYSTEM';
            return (
              <div
                key={msg.id}
                data-testid={`message-bubble-${msg.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isSystem ? 'center' : isClient ? 'flex-start' : 'flex-end',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    border: isClient
                      ? '1px solid var(--line, #dfe2e2)'
                      : '1px solid var(--line)',
                    backgroundColor: isClient
                      ? 'var(--badge-neutral-bg)'
                      : 'var(--badge-info-bg)',
                    color: 'var(--ink2)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '6px',
                      fontSize: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: isClient ? 'var(--badge-neutral-border)' : 'var(--navy, #25324f)',
                        color: isClient ? 'var(--ink2)' : '#ffffff',
                      }}
                    >
                      {isSystem ? 'Système' : isClient ? 'Client' : `Réparateur · ${activeThread.repairerName}`}
                    </span>
                    {msg.deleted && (
                      <span
                        data-testid={`message-deleted-${msg.id}`}
                        style={{ color: 'var(--red-text, #b91c1c)', fontSize: '11px', fontWeight: 700 }}
                      >
                        Supprimé par la modération
                      </span>
                    )}
                    <span
                      style={{
                        color: 'var(--muted, #6b7280)',
                        fontSize: '12px',
                      }}
                    >
                      {formatFrenchDateTime(msg.createdAt)}
                    </span>
                  </div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '14px',
                      lineHeight: '1.5',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
