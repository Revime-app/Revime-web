'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { STEP_UP_COPY, type StepUpMethodResponse, type StepUpPurpose } from '@revime/shared';
import { api, ApiError, errorMessage } from '../../lib/client/api';
import { IconClose } from './icons';

/**
 * The app's step-up (apps/mobile/src/lib/step-up-context.tsx + StepUpSheet): a sensitive call that the
 * API answers with STEP_UP_REQUIRED asks the person to confirm with their password, or with a code sent
 * by e-mail when the account has no password, then runs the call again.
 */
type Result<T> = { ok: true; value: T } | { ok: false; cancelled: true };
type WithStepUp = <T>(call: () => Promise<T>, purpose?: StepUpPurpose) => Promise<Result<T>>;

const Ctx = createContext<WithStepUp | null>(null);

type Request = { mode: 'PASSWORD' | 'EMAIL_CODE' };

export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(async () => {
    const r = await api.get<StepUpMethodResponse>('/security/step-up');
    const hasPassword = r.hasPassword ?? r.method === 'PASSWORD';
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setRequest({ mode: hasPassword ? 'PASSWORD' : 'EMAIL_CODE' });
    });
  }, []);

  const withStepUp = useCallback<WithStepUp>(
    async (call) => {
      try {
        return { ok: true, value: await call() };
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'STEP_UP_REQUIRED')) throw err;
      }
      if (!(await confirm())) return { ok: false, cancelled: true };
      return { ok: true, value: await call() };
    },
    [confirm],
  );

  const done = (ok: boolean) => {
    setRequest(null);
    pending.current?.(ok);
    pending.current = null;
  };

  return (
    <Ctx.Provider value={withStepUp}>
      {children}
      {request && <StepUpSheet mode={request.mode} onDone={done} />}
    </Ctx.Provider>
  );
}

export function useStepUp(): WithStepUp {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStepUp must be used inside StepUpProvider');
  return ctx;
}

function StepUpSheet({ mode, onDone }: { mode: 'PASSWORD' | 'EMAIL_CODE'; onDone: (ok: boolean) => void }) {
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const password = mode === 'PASSWORD';

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/security/step-up/code/send', {});
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      if (password) await api.post('/security/step-up', { password: value });
      else await api.post('/security/step-up/code', { code: value.trim() });
      onDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="stepup-title" onClick={() => !busy && onDone(false)}>
      <form className="ap-sheet__panel ap-stepup" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="ap-sheet__close" aria-label="Fermer" onClick={() => onDone(false)} disabled={busy}>
          <IconClose size={18} />
        </button>
        <h2 id="stepup-title">{STEP_UP_COPY.title}</h2>
        <p className="ap-muted">
          {password
            ? 'Pour votre sécurité, saisissez votre mot de passe avant de continuer.'
            : 'Pour votre sécurité, nous vous envoyons un code par e-mail avant de continuer.'}
        </p>
        {(password || sent) && (
          <label className="ap-field">
            <span>{password ? 'Mot de passe' : 'Code reçu par e-mail'}</span>
            <input
              type={password ? 'password' : 'text'}
              inputMode={password ? undefined : 'numeric'}
              autoComplete={password ? 'current-password' : 'one-time-code'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </label>
        )}
        {error && <p className="ap-field__error">{error}</p>}
        {password || sent ? (
          <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy || value.length === 0}>
            {busy ? 'Vérification…' : 'Confirmer'}
          </button>
        ) : (
          <button type="button" className="ap-btn ap-btn--primary ap-btn--block" onClick={() => void send()} disabled={busy}>
            {busy ? 'Envoi…' : 'Recevoir un code'}
          </button>
        )}
        {!password && sent && (
          <button type="button" className="ap-link" onClick={() => void send()} disabled={busy}>
            Renvoyer un code
          </button>
        )}
        <button type="button" className="ap-link ap-link--muted" onClick={() => onDone(false)} disabled={busy}>
          Annuler
        </button>
      </form>
    </div>
  );
}
