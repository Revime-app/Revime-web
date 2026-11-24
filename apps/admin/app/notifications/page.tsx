'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type {
  AdminBroadcastHistoryResponse,
  AdminBroadcastPreview,
  AdminBroadcastRecipientSuggestion,
  BroadcastTarget,
} from '@revime/shared';
import { BroadcastAudienceSelector } from '../../components/BroadcastAudienceSelector';
import {
  BroadcastComposer,
  type TemplatePresetKey,
} from '../../components/BroadcastComposer';
import { BroadcastPreviewCard } from '../../components/BroadcastPreviewCard';
import {
  isConsentRestricted,
  loadAudiencePreview,
  pushReachWarning,
  reachCounts,
  sendBlocker,
} from '../../lib/broadcast-audience';
import { BroadcastConfirmModal } from '../../components/BroadcastConfirmModal';
import { BroadcastHistoryTable } from '../../components/BroadcastHistoryTable';
import { Rocket } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface NotificationsPageProps {
  initialPreview?: AdminBroadcastPreview | null;
  initialHistory?: AdminBroadcastHistoryResponse | null;
  initialConfirmModalOpen?: boolean;
  initialPreviewError?: string | null;
}

/** What actually left, from the API's own counts: « envoyée » on a send that reached nobody was a lie. */
export function sendSummary(
  result: { sentEmailCount?: number; sentPushCount?: number; skippedNoConsentCount?: number } | null,
): string {
  if (!result) return 'Communication envoyée.';
  const parts = [`${result.sentEmailCount ?? 0} e-mail(s)`, `${result.sentPushCount ?? 0} notification(s) push`];
  const skipped = result.skippedNoConsentCount ?? 0;
  return (
    `Envoyé : ${parts.join(' et ')}.` +
    (skipped > 0 ? ` ${skipped} membre(s) écarté(s) faute d'accord marketing.` : '')
  );
}

/** V7 D2 (U5, Q6): a single recipient is named by pseudo, never by the internal id. */
export function computeTargetSummary(
  target: BroadcastTarget,
  recipient: AdminBroadcastRecipientSuggestion | null = null,
): string {
  if (target.type === 'INDIVIDUAL') {
    return `Destinataire unique · ${recipient ? `@${recipient.username}` : 'aucun destinataire choisi'}`;
  }
  const roleLabel =
    target.role === 'CLIENT'
      ? 'Clients'
      : target.role === 'REPAIRER'
        ? 'Réparateurs'
        : 'Tous les membres';
  const parts = [roleLabel];
  if (target.city) parts.push(target.city);
  if (target.department) parts.push(`Dép. ${target.department}`);
  if (target.verifiedOnly) parts.push('Vérifiés');
  return parts.join(' · ');
}

export default function NotificationsPage({
  initialPreview = null,
  initialHistory = null,
  initialConfirmModalOpen = false,
  initialPreviewError = null,
}: NotificationsPageProps) {
  // Target & Audience State
  const [target, setTarget] = useState<BroadcastTarget>({
    type: 'SEGMENT',
    role: 'ALL',
    city: '',
    department: '',
    verifiedOnly: false,
    activeOnly: true,
  });
  const [recipient, setRecipient] = useState<AdminBroadcastRecipientSuggestion | null>(null);

  // Composer State
  const [channels, setChannels] = useState<{ email: boolean; push: boolean }>({
    email: true,
    push: false,
  });
  const [templateKey, setTemplateKey] = useState<TemplatePresetKey>('CUSTOM');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Async Data State
  const [preview, setPreview] = useState<AdminBroadcastPreview | null>(initialPreview);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(initialPreviewError);
  const [history, setHistory] = useState<AdminBroadcastHistoryResponse | null>(initialHistory);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Modal & Submission State
  const [confirmModalOpen, setConfirmModalOpen] = useState(initialConfirmModalOpen);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Sync props if provided dynamically (testing / SSR)
  useEffect(() => {
    if (initialPreview !== undefined) {
      setPreview(initialPreview);
    }
  }, [initialPreview]);

  useEffect(() => {
    if (initialHistory !== undefined) {
      setHistory(initialHistory);
    }
  }, [initialHistory]);

  useEffect(() => {
    if (initialConfirmModalOpen !== undefined) {
      setConfirmModalOpen(initialConfirmModalOpen);
    }
  }, [initialConfirmModalOpen]);

  // Fetch preview when target changes (debounced)
  const fetchPreview = useCallback(async (t: BroadcastTarget) => {
    setPreviewLoading(true);
    const { preview: next, error } = await loadAudiencePreview(fetch, t);
    setPreview(next);
    setPreviewError(error);
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchPreview(target);
    }, 250);
    return () => clearTimeout(timer);
  }, [target, fetchPreview]);

  // Fetch history
  const fetchHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/proxy/admin/communications/history?page=${page}&limit=20`);
      if (res.ok) {
        const data = (await res.json()) as AdminBroadcastHistoryResponse;
        setHistory(data);
      }
    } catch {
      // history fetch error
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory(historyPage);
  }, [historyPage, fetchHistory]);

  // Validation
  const hasChannel = channels.email || channels.push;
  const isSubjectValid = subject.trim().length >= 3;
  const isBodyValid = body.trim().length >= 10;
  const isTargetValid =
    target.type === 'SEGMENT' ||
    (target.type === 'INDIVIDUAL' && Boolean(target.userId && target.userId.length >= 10));
  const blocker = sendBlocker({
    hasChannel,
    subjectValid: isSubjectValid,
    bodyValid: isBodyValid,
    targetValid: isTargetValid,
    sending,
    previewError,
  });
  const canSend = blocker === null;
  const consentRestricted = isConsentRestricted(target, templateKey);
  const reach = reachCounts(preview, consentRestricted);
  // V7 D1 (U6): said beside the button too, because the preview card can be scrolled out of view.
  const pushWarning = pushReachWarning(preview, consentRestricted, channels.push);

  // Dispatch broadcast
  const handleConfirmSend = async () => {
    if (!canSend) return;
    setSending(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/proxy/admin/communications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          channels,
          templateKey,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Échec lors de l'envoi de la communication.");
      }

      const result = (await res.json().catch(() => null)) as {
        sentEmailCount?: number;
        sentPushCount?: number;
        skippedNoConsentCount?: number;
      } | null;
      setConfirmModalOpen(false);
      setFeedback({
        type: 'success',
        message: sendSummary(result),
      });

      // Refetch history and audience preview
      void fetchHistory(1);
      void fetchPreview(target);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Une erreur est survenue lors de l’envoi.',
      });
      setConfirmModalOpen(false);
    } finally {
      setSending(false);
    }
  };

  const targetSummary = computeTargetSummary(target, recipient);

  return (
    <div className="page page--detail">
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 6px 0', fontSize: '24px', fontWeight: 700, color: 'var(--ink, #141414)' }}>
          Notifications & e-mails
        </h1>
        <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
          Hub de communication multicanal : diffusez des annonces, des alertes de proximité ou des rappels ciblés par e-mail et notifications push mobiles.
        </p>
      </div>

      {/* Feedback Alert Banner */}
      {feedback && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 6px)',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor:
              feedback.type === 'success' ? 'var(--badge-success-bg)' : 'var(--red-soft, #feedf0)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'}`,
            color:
              feedback.type === 'success' ? 'var(--badge-success-text)' : 'var(--red-text, #bd0e26)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '16px',
              padding: '0 4px',
            }}
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}

      {/* Main 2-column Detail Grid */}
      <div className="detail-grid">
        {/* Left Column (1.6fr): Audience Selector, Composer, Trigger, History */}
        <div data-testid="detail-grid-left">
          <BroadcastAudienceSelector
            target={target}
            onChange={(nextTarget) => setTarget(nextTarget)}
            recipient={recipient}
            onRecipientChange={setRecipient}
            disabled={sending}
          />

          <BroadcastComposer
            channels={channels}
            onChannelsChange={(nextChannels) => setChannels(nextChannels)}
            templateKey={templateKey}
            onTemplateKeyChange={(k) => setTemplateKey(k)}
            subject={subject}
            onSubjectChange={(s) => setSubject(s)}
            body={body}
            onBodyChange={(b) => setBody(b)}
            disabled={sending}
          />

          {/* Trigger Send Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              padding: '16px 20px',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-card, 8px)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
              {blocker && blocker !== 'Envoi en cours.'
                ? blocker
                : consentRestricted
                  ? `${reach.email} e-mail(s) et ${reach.push} push partiront (accord marketing requis, sur ${reach.total} membre(s)).`
                  : `${reach.total} destinataire(s) recevront ce message.`}
              {pushWarning && !blocker ? (
                <div role="alert" style={{ marginTop: '4px', color: 'var(--red-text, #bd0e26)', fontWeight: 500 }}>
                  {pushWarning}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={!canSend}
              onClick={() => setConfirmModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                fontSize: '14px',
                fontWeight: 600,
                backgroundColor: 'var(--navy, #25324f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--r-field, 4px)',
                cursor: !canSend ? 'not-allowed' : 'pointer',
                opacity: !canSend ? 0.6 : 1,
                boxShadow: canSend ? '0 1px 3px rgba(37, 50, 79, 0.2)' : 'none',
              }}
            >
              <Icon as={Rocket} /> Vérifier et envoyer la communication
            </button>
          </div>

          {/* Broadcast History Table */}
          <BroadcastHistoryTable
            items={history?.items ?? []}
            total={history?.total ?? 0}
            loading={historyLoading}
            onRefresh={() => void fetchHistory(historyPage)}
            page={historyPage}
            onPageChange={(p) => setHistoryPage(p)}
          />
        </div>

        {/* Right Column (1.1fr): Live Preview Card */}
        <div data-testid="detail-grid-right">
          {previewError && (
            <div
              role="alert"
              style={{
                marginBottom: '12px',
                padding: '10px 14px',
                fontSize: '13px',
                borderRadius: 'var(--r-field, 6px)',
                border: '1px solid var(--badge-danger-border)',
                backgroundColor: 'var(--badge-danger-bg)',
                color: 'var(--badge-danger-text)',
              }}
            >
              {previewError} L’envoi est bloqué tant que l’audience n’a pas pu être calculée.
            </div>
          )}
          <BroadcastPreviewCard
            preview={preview}
            loading={previewLoading}
            subject={subject}
            body={body}
            channels={channels}
            consentRestricted={consentRestricted}
          />
        </div>
      </div>

      {/* Confirmation Modal */}
      <BroadcastConfirmModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={() => void handleConfirmSend()}
        submitting={sending}
        totalRecipients={preview?.totalRecipients ?? 0}
        channels={channels}
        subject={subject || 'Sans objet'}
        body={body || 'Aucun contenu'}
        targetSummary={targetSummary}
      />
    </div>
  );
}
