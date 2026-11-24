'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AdminDisputeSpacesDto,
  DisputeAttachmentInput,
  DisputeStatusType,
} from '@revime/shared';
import {
  canWriteSpace,
  renderSupportBody,
  resolveConfidentialSender,
  resolveDisputeSender,
  spaceTabs,
  visibleToLabel,
  type DisputePartyRef,
  type DisputeSpaceTab,
} from '../../lib/dispute-spaces';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { ResponseTemplatePicker } from '../../components/ResponseTemplatePicker';
import { Paperclip } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface MainMessageItem {
  id: string;
  senderUserId: string | null;
  kind?: string;
  body: string;
  photoPath?: string | null;
  documentPath?: string | null;
  documentName?: string | null;
  documentSizeBytes?: number | null;
  createdAt: string;
  senderName?: string | null;
  senderRole?: 'CLIENT' | 'REPAIRER' | 'ADMIN' | 'SYSTEM' | null;
}

export interface DisputeSpacesPanelProps {
  disputeId: string;
  disputeStatus: DisputeStatusType;
  mainMessages: MainMessageItem[];
  client?: DisputePartyRef | null;
  repairer?: DisputePartyRef | null;
  onReloadDossier?: () => void;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DisputeSpacesPanel({
  disputeId,
  disputeStatus,
  mainMessages,
  client,
  repairer,
  onReloadDossier,
}: DisputeSpacesPanelProps) {
  const [activeTab, setActiveTab] = useState<DisputeSpaceTab>('MAIN');
  const [spacesData, setSpacesData] = useState<AdminDisputeSpacesDto | null>(null);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [spacesError, setSpacesError] = useState<string | null>(null);

  // Composer state
  const [messageBody, setMessageBody] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const adminMe = useAdminMe();
  const canHandle = hasPermission(adminMe, 'disputes.handle');
  const isWritable = canWriteSpace(activeTab, disputeStatus);

  const loadSpaces = useCallback(async () => {
    setLoadingSpaces(true);
    setSpacesError(null);
    try {
      const res = await fetch(`/api/proxy/admin/litiges/${disputeId}/espaces`);
      if (!res.ok) {
        setSpacesError('Impossible de charger les espaces confidentiels.');
        return;
      }
      const data: AdminDisputeSpacesDto = await res.json();
      setSpacesData(data);
    } catch {
      setSpacesError('Erreur de connexion.');
    } finally {
      setLoadingSpaces(false);
    }
  }, [disputeId]);

  useEffect(() => {
    loadSpaces();
  }, [loadSpaces]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageBody.trim() || isSending) return;

    setIsSending(true);
    setSendError(null);

    try {
      let attachment: DisputeAttachmentInput | undefined = undefined;

      if (selectedFile) {
        // 1. Sign upload URL
        const signRes = await fetch(`/api/proxy/admin/litiges/${disputeId}/attachments/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            space: activeTab,
            contentType: selectedFile.type,
          }),
        });

        if (!signRes.ok) {
          const errData = await signRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || "Échec de signature de la pièce jointe.");
        }

        const { path, uploadUrl } = await signRes.json();

        // 2. Upload file to signed URL
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': selectedFile.type },
          body: selectedFile,
        });

        if (!uploadRes.ok) {
          throw new Error("Échec du téléversement de la pièce jointe.");
        }

        attachment = {
          kind: selectedFile.type === 'application/pdf' ? 'document' : 'photo',
          path,
          name: selectedFile.name,
          sizeBytes: selectedFile.size,
        };
      }

      // 3. Post message
      const postRes = await fetch(`/api/proxy/admin/litiges/${disputeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          space: activeTab,
          body: messageBody.trim(),
          attachment,
        }),
      });

      if (!postRes.ok) {
        const errData = await postRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Échec de l'envoi du message.");
      }

      // Reset form
      setMessageBody('');
      setSelectedFile(null);

      // Reload
      await loadSpaces();
      onReloadDossier?.();
    } catch (err: any) {
      setSendError(err.message || 'Une erreur est survenue.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Sub-tabs header */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          gap: '8px',
          background: 'var(--badge-neutral-bg)',
          padding: '4px 8px 0',
          borderRadius: '6px 6px 0 0',
        }}
      >
        {spaceTabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          const count =
            tab.id === 'MAIN'
              ? mainMessages.length
              : tab.id === 'CLIENT'
                ? (spacesData?.client.length ?? 0)
                : (spacesData?.repairer.length ?? 0);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? 'var(--ink2)' : 'var(--muted)',
                background: isSelected ? 'var(--paper)' : 'transparent',
                border: isSelected ? '1px solid var(--line, #dfe2e2)' : '1px solid transparent',
                borderBottom: isSelected ? '1px solid var(--paper)' : '1px solid transparent',
                borderRadius: '6px 6px 0 0',
                marginBottom: '-1px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  backgroundColor: isSelected ? 'var(--badge-neutral-border)' : 'var(--badge-neutral-bg)',
                  color: isSelected ? 'var(--ink2)' : 'var(--muted)',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Message list area */}
      <div
        style={{
          minHeight: '260px',
          maxHeight: '450px',
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: 'var(--badge-neutral-bg)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {activeTab === 'MAIN' && (
          <>
            {mainMessages.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 'auto' }}>
                Aucun message dans la conversation principale.
              </p>
            ) : (
              mainMessages.map((m) => {
                const isSupport = m.kind === 'SUPPORT';
                const isSystem = m.kind === 'SYSTEM';
                const sender = resolveDisputeSender(m, client, repairer);

                return (
                  <div
                    key={m.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: isSupport
                        ? 'var(--badge-info-bg)'
                        : isSystem
                          ? 'var(--badge-neutral-bg)'
                          : 'var(--paper)',
                      border: isSupport
                        ? '1px solid var(--badge-info-border)'
                        : '1px solid var(--line)',
                      maxWidth: '85%',
                      alignSelf: isSupport
                        ? 'center'
                        : isSystem
                          ? 'center'
                          : m.senderUserId
                            ? 'flex-start'
                            : 'flex-end',
                      width: isSupport || isSystem ? '90%' : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                        fontSize: '11px',
                        gap: '12px',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 700,
                          color: sender.color,
                          backgroundColor: sender.badgeBg,
                          border: `1px solid ${sender.badgeBorder}`,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                        }}
                      >
                        {sender.label}
                      </span>
                      <span style={{ color: 'var(--faint)' }}>{formatDate(m.createdAt)}</span>
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--ink2)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {isSupport ? renderSupportBody(m.body) : m.body}
                    </div>
                    {m.photoPath && (
                      <div style={{ marginTop: '8px' }}>
                        <a
                          href={m.photoPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-block' }}
                        >
                          <img
                            src={m.photoPath}
                            alt="Pièce jointe photo"
                            style={{
                              maxWidth: '200px',
                              maxHeight: '160px',
                              borderRadius: '6px',
                              border: '1px solid var(--line)',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        </a>
                      </div>
                    )}
                    {m.documentName && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '6px 10px',
                          background: 'var(--paper)',
                          border: '1px solid var(--line)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <DocumentIcon /> {m.documentName} {formatFileSize(m.documentSizeBytes)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {(activeTab === 'CLIENT' || activeTab === 'REPAIRER') && (
          <>
            {loadingSpaces ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 'auto' }}>
                Chargement des messages de l&apos;espace...
              </p>
            ) : spacesError ? (
              <p style={{ color: 'var(--badge-danger-text)', fontSize: '13px', margin: 'auto' }}>
                {spacesError}
              </p>
            ) : (
              (() => {
                const msgs =
                  activeTab === 'CLIENT'
                    ? spacesData?.client ?? []
                    : spacesData?.repairer ?? [] ;

                if (msgs.length === 0) {
                  return (
                    <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 'auto' }}>
                      Aucun message dans cet espace confidentiel.
                    </p>
                  );
                }

                return msgs.map((m) => {
                  const isRevime = m.author === 'REVIME';
                  const confSender = resolveConfidentialSender(m, activeTab === 'CLIENT' ? 'CLIENT' : 'REPAIRER', client, repairer);

                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        backgroundColor: isRevime ? 'var(--badge-info-bg)' : 'var(--paper)',
                        border: isRevime ? '1px solid var(--badge-info-border)' : '1px solid var(--line)',
                        maxWidth: '85%',
                        alignSelf: isRevime ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                          fontSize: '11px',
                          gap: '12px',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 700,
                            color: confSender.color,
                            backgroundColor: confSender.badgeBg,
                            border: `1px solid ${confSender.badgeBorder}`,
                            padding: '2px 8px',
                            borderRadius: '9999px',
                          }}
                        >
                          {confSender.label}
                        </span>
                        <span style={{ color: 'var(--faint)' }}>{formatDate(m.createdAt)}</span>
                      </div>
                      {m.body && (
                        <div
                          style={{
                            fontSize: '13px',
                            color: 'var(--ink2)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {m.body}
                        </div>
                      )}
                      {m.photoUrl && (
                        <div style={{ marginTop: '8px' }}>
                          <a
                            href={m.photoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-block' }}
                          >
                            <img
                              src={m.photoUrl}
                              alt="Pièce jointe photo"
                              style={{
                                maxWidth: '200px',
                                maxHeight: '160px',
                                borderRadius: '4px',
                                border: '1px solid var(--line)',
                              }}
                            />
                          </a>
                        </div>
                      )}
                      {m.document && (
                        <div style={{ marginTop: '8px' }}>
                          <a
                            href={m.document.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              background: 'var(--badge-neutral-bg)',
                              border: '1px solid var(--line)',
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: 'var(--badge-info-text)',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            <DocumentIcon /> {m.document.name} {formatFileSize(m.document.sizeBytes)}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            )}
          </>
        )}
      </div>

      {/* Composer Area */}
      {canHandle && (
        <div
          style={{
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: '6px',
            padding: '14px',
            backgroundColor: 'var(--paper)',
          }}
        >
          {!isWritable ? (
            <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic' }}>
              Ce litige est clos. Seule la conversation principale reste accessible pour notifier
              les parties.
            </div>
          ) : (
            <div>
              <ResponseTemplatePicker
                onSelectTemplate={(text) =>
                  setMessageBody((prev) => (prev.trim().length > 0 ? `${prev}\n\n${text}` : text))
                }
              />
              <form onSubmit={handleSendMessage}>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Rédigez votre message..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />

              {/* Attachment selector */}
              <div
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    backgroundColor: 'var(--badge-neutral-bg)',
                    border: '1px solid var(--line)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    color: 'var(--ink2)',
                    fontWeight: 500,
                  }}
                >
                  <Icon as={Paperclip} /> Joindre une photo ou un PDF
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSelectedFile(f);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>

                {selectedFile && (
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink2)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--badge-danger-text)',
                        cursor: 'pointer',
                        fontWeight: 700,
                        padding: '0 4px',
                      }}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>

              {sendError && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--badge-danger-text)' }}>
                  {sendError}
                </div>
              )}

              {/* Footer with visibility indicator and Send button */}
              <div
                style={{
                  marginTop: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid var(--badge-neutral-bg)',
                  paddingTop: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color:
                      activeTab === 'MAIN'
                        ? 'var(--badge-success-text)'
                        : activeTab === 'CLIENT'
                          ? 'var(--badge-warning-text)'
                          : 'var(--badge-info-text)',
                  }}
                >
                  {visibleToLabel(activeTab)}
                </span>

                <button
                  type="submit"
                  disabled={!messageBody.trim() || isSending}
                  style={{
                    padding: '8px 18px',
                    backgroundColor:
                      !messageBody.trim() || isSending ? 'var(--faint)' : 'var(--navy, #25324f)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: !messageBody.trim() || isSending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSending ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** CF4-49 follow-up: replaces the 📄 emoji. Inline because the admin has no icon library. */
function DocumentIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: 'middle' }}
    >
      <path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
