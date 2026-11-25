'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import {
  MESSAGE_BODY_MAX,
  type ConversationDto,
  type ConversationListItem,
  type MessageDto,
  type SendMessageInput,
} from '@revime/shared';
import { api, errorMessage } from '../../../lib/client/api';
import { useRequireSession } from '../../../lib/client/session';
import { IconArrowLeft, IconCamera, IconMessage, IconShieldCheck } from '../../../components/app/icons';
import { Loader, euroFmt, initials } from '../../../components/app/ui';

/**
 * Messages, as in the app's « Messages » tab and conversation screen (apps/mobile, never changed).
 * The app is refreshed by push notifications; the site asks again instead: every 4 s in an open
 * conversation, every 15 s for the list, and only while the tab is visible.
 */
const THREAD_MS = 4000;
const LIST_MS = 15000;

function usePoll<T>(path: string | null, every: number) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const d = await api.get<T>(path);
          if (live) {
            setData(d);
            setError(null);
          }
        } catch (e) {
          if (live) setError(errorMessage(e));
        }
      }
      if (live) timer = setTimeout(run, every);
    };
    void run();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [path, every, tick]);
  return { data, error, refresh: () => setTick((t) => t + 1), setData };
}

const time = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

function List({ items, current }: { items: ConversationListItem[] | undefined; current: string | null }) {
  if (!items) return <Loader />;
  if (items.length === 0) {
    return (
      <div className="ap-empty">
        <strong>Aucun message pour l’instant</strong>
        <span>Quand vous choisissez un réparateur ou qu’il répond à votre demande, votre conversation s’ouvre ici.</span>
        <Link href="/reparateurs" className="ap-btn ap-btn--secondary">Trouver un réparateur</Link>
      </div>
    );
  }
  return (
    <ul className="ap-inbox" aria-label="Conversations">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/messages?c=${c.id}`} className="ap-inbox__row" aria-current={c.id === current ? 'true' : undefined}>
            {c.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatarUrl} alt="" className="ap-avatar" />
            ) : (
              <span className="ap-avatar" aria-hidden="true">{initials(c.counterpartName)}</span>
            )}
            <span className="ap-inbox__main">
              <span className="ap-inbox__top">
                <strong>{c.counterpartName}</strong>
                <time>{time(c.lastMessageAt)}</time>
              </span>
              <span className="ap-inbox__subject">{c.subject}</span>
              <span className="ap-inbox__preview">{c.preview}</span>
            </span>
            {c.unread > 0 && <span className="ap-inbox__unread" aria-label={`${c.unread} non lu`}>{c.unread}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Bubble({ m }: { m: MessageDto }) {
  if (m.kind === 'SYSTEM') return <p className="ap-msg ap-msg--system">{m.body}</p>;
  return (
    <div className={m.mine ? 'ap-msg ap-msg--mine' : m.kind === 'SUPPORT' ? 'ap-msg ap-msg--support' : 'ap-msg'}>
      {m.kind === 'SUPPORT' && <small>Équipe REVIME</small>}
      {m.photoUrl && (
        <a href={m.photoUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.photoUrl} alt="Photo envoyée" />
        </a>
      )}
      {m.document && (
        <a className="ap-msg__doc" href={m.document.url} target="_blank" rel="noreferrer">
          📄 {m.document.name}
        </a>
      )}
      {m.body && <p>{m.body}</p>}
      <time>{time(m.createdAt)}</time>
    </div>
  );
}

function Thread({ id, messagingEnabled }: { id: string; messagingEnabled: boolean }) {
  const thread = usePoll<ConversationDto>(`/conversations/${id}`, THREAD_MS);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const count = thread.data?.messages.length ?? 0;
  const readFor = useRef<string | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [count]);
  useEffect(() => {
    if (thread.data && readFor.current !== id) {
      readFor.current = id;
      api.patch(`/conversations/${id}/read`, {}).catch(() => {});
    }
  }, [thread.data, id]);

  if (!thread.data) return thread.error ? <p className="ap-error">{thread.error}</p> : <Loader />;
  const t = thread.data;
  const blocked = t.blocked?.active ?? false;
  const canSend = messagingEnabled && !blocked && (text.trim().length > 0 || file !== null) && !busy;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      const input: SendMessageInput = { body: text.trim() };
      if (file) {
        const contentType = file.type as 'image/jpeg' | 'image/png' | 'application/pdf';
        if (!['image/jpeg', 'image/png', 'application/pdf'].includes(contentType)) {
          throw new Error('Seuls les formats JPEG, PNG et PDF sont acceptés.');
        }
        const signed = await api.post<{ path: string; uploadUrl: string }>(`/conversations/${id}/attachments/sign`, { contentType });
        const put = await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
        if (!put.ok) throw new Error('L’envoi de la pièce jointe a échoué. Réessayez.');
        if (contentType === 'application/pdf') {
          input.documentPath = signed.path;
          input.documentName = file.name.slice(0, 120);
          input.documentSizeBytes = file.size;
        } else input.photoPath = signed.path;
      }
      const sent = await api.post<MessageDto>(`/conversations/${id}/messages`, input);
      thread.setData({ ...t, messages: [...t.messages, sent] });
      setText('');
      setFile(null);
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ap-thread" aria-label={`Conversation avec ${t.counterpartName}`}>
      <header className="ap-thread__head">
        <Link href="/messages" className="ap-thread__back ap-only-narrow" aria-label="Toutes les conversations">
          <IconArrowLeft size={20} />
        </Link>
        <span className="ap-avatar" aria-hidden="true">{initials(t.counterpartName)}</span>
        <div>
          <strong>
            {t.counterpartIsRepairer ? <Link href={`/reparateurs/${t.counterpartUserId}`}>{t.counterpartName}</Link> : t.counterpartName}
          </strong>
          <span>{t.subject}</span>
        </div>
        {t.demandeId && (
          <Link href={`/mes-demandes/${t.demandeId}`} className="ap-btn ap-btn--secondary ap-btn--sm">Voir la demande</Link>
        )}
      </header>

      {t.offerRecap && (
        <div className="ap-thread__recap">
          <span>Offre : {t.offerRecap.object}</span>
          <strong>{euroFmt(t.offerRecap.priceCents)}</strong>
        </div>
      )}

      <div className="ap-thread__body">
        <p className="ap-msg ap-msg--system">
          <IconShieldCheck size={14} /> Restez sur REVIME pour payer et échanger : c’est ce qui vous protège.
        </p>
        {t.messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={end} />
      </div>

      {blocked ? (
        <p className="ap-thread__closed">
          {t.blocked.byMe ? 'Vous avez bloqué cette personne.' : 'Vous ne pouvez plus échanger avec cette personne.'}
        </p>
      ) : !messagingEnabled ? (
        <p className="ap-thread__closed">La messagerie est momentanément indisponible. Réessayez un peu plus tard.</p>
      ) : (
        <form className="ap-composer" onSubmit={send}>
          {error && <p className="ap-error" role="alert">{error}</p>}
          {file && (
            <p className="ap-composer__file">
              {file.name}{' '}
              <button type="button" className="ap-link" onClick={() => setFile(null)}>Retirer</button>
            </p>
          )}
          <div className="ap-composer__row">
            <label className="ap-composer__attach" aria-label="Joindre une photo ou un PDF">
              <IconCamera size={20} />
              <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} hidden />
            </label>
            <textarea
              value={text}
              maxLength={MESSAGE_BODY_MAX}
              rows={1}
              placeholder="Votre message"
              aria-label="Votre message"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button className="ap-btn ap-btn--primary" disabled={!canSend}>
              {busy ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Inbox() {
  const me = useRequireSession();
  const current = useSearchParams().get('c');
  const list = usePoll<ConversationListItem[]>(me ? '/conversations' : null, LIST_MS);
  const router = useRouter();

  // Desktop: open the latest conversation rather than an empty right pane.
  useEffect(() => {
    if (!current && list.data?.length && window.matchMedia('(min-width: 960px)').matches) {
      router.replace(`/messages?c=${list.data[0]!.id}`);
    }
  }, [current, list.data, router]);

  if (!me) return <Loader />;
  return (
    <div className="ap-page ap-messages" data-open={current ? '' : undefined}>
      <aside className="ap-messages__list">
        <h1>Messages</h1>
        {list.error && !list.data ? <p className="ap-error">{list.error}</p> : <List items={list.data} current={current} />}
      </aside>
      <div className="ap-messages__thread">
        {current ? (
          <Thread key={current} id={current} messagingEnabled={me.messagingEnabled ?? true} />
        ) : (
          <div className="ap-empty ap-only-wide">
            <IconMessage size={28} />
            <strong>Choisissez une conversation</strong>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<Loader />}>
      <Inbox />
    </Suspense>
  );
}
