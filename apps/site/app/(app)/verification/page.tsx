'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authErrorMessageFr, frPhoneSchema, type MeResponse, type StartPhoneVerificationResponse } from '@revime/shared';
import { api, errorMessage } from '../../../lib/client/api';
import { authClient } from '../../../lib/client/auth';
import { DEMO, HOME_PATH } from '../../../lib/client/config';
import { useRequireSession, useSession } from '../../../lib/client/session';
import { IconShieldCheck } from '../../../components/app/icons';
import { Loader } from '../../../components/app/ui';

/**
 * The app's « Vérifiez votre compte » (apps/mobile/app/verification.tsx): a 6-digit code by e-mail
 * (Better Auth email OTP) and one by SMS (`/verification/phone/start` then `/check`).
 */
function useCountdown(): [number, (s: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

function Verify() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const router = useRouter();
  const raw = useSearchParams().get('suite');
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : HOME_PATH;

  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailWait, setEmailWait] = useCountdown();
  const [phone, setPhone] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [phoneWait, setPhoneWait] = useCountdown();
  const [busy, setBusy] = useState<'email' | 'phone' | null>(null);

  useEffect(() => {
    if (me?.phone && !phone) setPhone(me.phone);
  }, [me, phone]);

  if (!me) return <Loader />;
  const emailDone = DEMO || me.emailVerified === true;
  const phoneDone = DEMO || me.phoneVerified === true;

  async function sendEmail() {
    setBusy('email');
    setEmailErr(null);
    const res = await authClient.emailOtp.sendVerificationOtp({ email: me!.email, type: 'email-verification' });
    setBusy(null);
    if (res.error) return setEmailErr(authErrorMessageFr(res.error.code ?? '', 'Envoi impossible. Réessayez.'));
    setEmailSent(true);
    setEmailWait(60);
  }
  async function checkEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy('email');
    setEmailErr(null);
    const res = await authClient.emailOtp.verifyEmail({ email: me!.email, otp: emailCode.trim() });
    setBusy(null);
    if (res.error) return setEmailErr(authErrorMessageFr(res.error.code ?? '', 'Code incorrect.'));
    await refresh();
  }
  async function sendPhone(e: React.FormEvent) {
    e.preventDefault();
    const parsed = frPhoneSchema.safeParse(phone);
    if (!parsed.success) return setPhoneErr(parsed.error.issues[0]?.message ?? 'Numéro invalide.');
    setBusy('phone');
    setPhoneErr(null);
    try {
      const r = await api.post<StartPhoneVerificationResponse>('/verification/phone/start', { phone: parsed.data });
      setPhoneSent(true);
      setPhoneWait(r.retryAfterSeconds || 60);
    } catch (err) {
      setPhoneErr(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  async function checkPhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy('phone');
    setPhoneErr(null);
    try {
      await api.post<MeResponse>('/verification/phone/check', { phone: frPhoneSchema.parse(phone), code: phoneCode.trim() });
      await refresh();
    } catch (err) {
      setPhoneErr(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  return (
    <div className="ap-page ap-narrow ap-verify">
      <h1>Vérifiez votre compte</h1>
      <p className="ap-muted">Deux codes à 6 chiffres. Ils protègent votre compte et rassurent les autres membres.</p>

      <section className="ap-box" data-done={emailDone || undefined}>
        <h2>1. Votre adresse e-mail {emailDone && <span className="ap-done">✓ Vérifiée</span>}</h2>
        {!emailDone && (
          <>
            <p>
              Code envoyé à <strong>{me.email}</strong>
            </p>
            {!emailSent ? (
              <button className="ap-btn ap-btn--primary" onClick={() => void sendEmail()} disabled={busy !== null}>
                Recevoir le code
              </button>
            ) : (
              <form className="ap-form" onSubmit={checkEmail}>
                <label className="ap-field">
                  <span>Code reçu par e-mail</span>
                  <input inputMode="numeric" autoComplete="one-time-code" value={emailCode} onChange={(e) => setEmailCode(digits(e.target.value))} />
                </label>
                <div className="ap-row-actions">
                  <button className="ap-btn ap-btn--primary" disabled={emailCode.length !== 6 || busy !== null}>Valider</button>
                  <button type="button" className="ap-link ap-link--muted" disabled={emailWait > 0} onClick={() => void sendEmail()}>
                    {emailWait > 0 ? `Renvoyer dans ${emailWait} s` : 'Renvoyer le code'}
                  </button>
                </div>
              </form>
            )}
            {emailErr && <p className="ap-error" role="alert">{emailErr}</p>}
          </>
        )}
      </section>

      <section className="ap-box" data-done={phoneDone || undefined}>
        <h2>2. Votre téléphone {phoneDone && <span className="ap-done">✓ Vérifié</span>}</h2>
        {!phoneDone && (
          <>
            {!phoneSent ? (
              <form className="ap-form" onSubmit={sendPhone}>
                <label className="ap-field">
                  <span>Téléphone mobile</span>
                  <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <button className="ap-btn ap-btn--primary" disabled={busy !== null}>Recevoir le code par SMS</button>
              </form>
            ) : (
              <form className="ap-form" onSubmit={checkPhone}>
                <label className="ap-field">
                  <span>Code reçu par SMS au {phone}</span>
                  <input inputMode="numeric" autoComplete="one-time-code" value={phoneCode} onChange={(e) => setPhoneCode(digits(e.target.value))} />
                </label>
                <div className="ap-row-actions">
                  <button className="ap-btn ap-btn--primary" disabled={phoneCode.length !== 6 || busy !== null}>Valider</button>
                  <button type="button" className="ap-link ap-link--muted" disabled={phoneWait > 0} onClick={() => setPhoneSent(false)}>
                    {phoneWait > 0 ? `Renvoyer dans ${phoneWait} s` : 'Changer de numéro ou renvoyer'}
                  </button>
                </div>
              </form>
            )}
            {phoneErr && <p className="ap-error" role="alert">{phoneErr}</p>}
          </>
        )}
      </section>

      {emailDone && phoneDone ? (
        <button className="ap-btn ap-btn--primary ap-btn--block ap-btn--lg" onClick={() => router.replace(next)}>
          C’est parti
        </button>
      ) : (
        <p className="ap-hint">
          <IconShieldCheck size={14} /> Vous pourrez aussi finir plus tard depuis <Link href="/profil">votre profil</Link>.
        </p>
      )}
    </div>
  );
}

export default function VerificationPage() {
  return (
    <Suspense fallback={<Loader />}>
      <Verify />
    </Suspense>
  );
}
