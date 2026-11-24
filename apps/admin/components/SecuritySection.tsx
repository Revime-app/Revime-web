'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { authErrorMessageFr } from '@revime/shared';
import { twoFactor } from '../lib/auth-client';
import { parseTotpCode, totpSecretOf } from '../lib/two-factor';
import { AUTHENTICATOR_APPS, formatSecretForEntry } from '../lib/two-factor-guide';
import { useAdminMe } from './AdminGate';

import { BackupCodesModal } from './BackupCodesModal';

/**
 * CF4-41 (spec §4.3). Setting up the mandatory second factor, as the « Sécurité » section of
 * « Paramètres ». Every other page sends an unverified staff session there (AdminGate +
 * gateRoute).
 *
 * Steps: password → scan the QR code (or type the key) → confirm with a code → the backup
 * codes, shown ONCE. Written as a guide for staff who have never used an authenticator app.
 * The QR code is drawn in the browser (qrcode.react): the secret never leaves the page.
 */
type Step =
  | { kind: 'password' }
  | { kind: 'scan'; totpURI: string; backupCodes: string[] }
  | { kind: 'codes'; backupCodes: string[] };

const STEPS = ['Mot de passe', 'Scanner le QR code', 'Saisir le code', 'Codes de secours'] as const;
const STEP_INDEX: Record<Step['kind'], number> = { password: 0, scan: 1, codes: 3 };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="tfa__copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Copié' : label}
    </button>
  );
}

export function SecuritySection() {
  const me = useAdminMe();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [showBackupCodesModal, setShowBackupCodesModal] = useState(false);

  // Kept until the codes are acknowledged: the verified session would otherwise replace the
  // one-time backup codes with the « active » line before the operator has saved them.
  if (me?.twoFactorVerified && step.kind !== 'codes') {
    return (
      <div data-testid="tfa-active-view">
        <p>La double authentification est active sur cette session.</p>
        <div style={{ marginTop: '12px' }}>
          <button
            type="button"
            data-testid="open-backup-codes-modal-btn"
            onClick={() => setShowBackupCodesModal(true)}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--navy-text, #25324f)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Codes de secours (2FA)
          </button>
        </div>
        <BackupCodesModal
          isOpen={showBackupCodesModal}
          onClose={() => setShowBackupCodesModal(false)}
        />
      </div>
    );
  }

  async function onEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await twoFactor.enable({ password, issuer: 'REVIME Admin' });
    setBusy(false);
    if (err || !data) {
      setError(authErrorMessageFr(err?.code, 'Activation impossible.'));
      return;
    }
    setPassword('');
    setStep({ kind: 'scan', totpURI: data.totpURI, backupCodes: data.backupCodes });
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== 'scan') return;
    const parsed = parseTotpCode(code);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await twoFactor.verifyTotp({ code: parsed.code });
    setBusy(false);
    if (err) {
      setError(authErrorMessageFr(err.code, 'Code incorrect.'));
      return;
    }
    setStep({ kind: 'codes', backupCodes: step.backupCodes });
  }

  const current = STEP_INDEX[step.kind];
  const secret = step.kind === 'scan' ? (totpSecretOf(step.totpURI) ?? '') : '';

  return (
    <div className="tfa">
      <p>
        La double authentification est obligatoire pour l&apos;équipe Revime. Votre compte donne accès aux
        paiements et aux données des utilisateurs : un code à 6 chiffres affiché sur votre téléphone, en plus
        du mot de passe, protège le compte même si le mot de passe fuite.
      </p>

      <ol className="tfa__steps" aria-label="Étapes">
        {STEPS.map((label, i) => {
          // The scan screen carries steps 2 and 3 (scan, then type the code) on one form.
          const isCurrent = step.kind === 'scan' ? i === 1 || i === 2 : i === current;
          const isDone = !isCurrent && i < current;
          return (
            <li
              key={label}
              className={isCurrent ? 'tfa__step tfa__step--current' : isDone ? 'tfa__step tfa__step--done' : 'tfa__step'}
              aria-current={i === current ? 'step' : undefined}
            >
              <span className="tfa__step-num">{isDone ? '✓' : i + 1}</span> {label}
            </li>
          );
        })}
      </ol>

      {step.kind === 'password' && (
        <>
          <div className="tfa__box">
            <p className="tfa__box-title">Avant de commencer</p>
            <p>
              Il vous faut votre téléphone et environ 2 minutes. Installez une application d&apos;authentification
              gratuite si vous n&apos;en avez pas déjà une :
            </p>
            <ul className="tfa__apps">
              {AUTHENTICATOR_APPS.map((app) => (
                <li key={app.name}>
                  <strong>{app.name}</strong>
                  {' · '}
                  <a href={app.ios} target="_blank" rel="noopener noreferrer">
                    iPhone (App Store)
                  </a>
                  {' · '}
                  <a href={app.android} target="_blank" rel="noopener noreferrer">
                    Android (Google Play)
                  </a>
                </li>
              ))}
            </ul>
            <p className="tfa__hint">Toute autre application d&apos;authentification qui lit les QR codes convient aussi.</p>
          </div>

          <form onSubmit={onEnable}>
            <div>
              <label htmlFor="securite-password">Mot de passe</label>
              <p className="tfa__hint">Pour confirmer que c&apos;est bien vous.</p>
              <input
                id="securite-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p role="alert">{error}</p>}
            <div>
              <button type="submit" disabled={busy}>
                {busy ? 'Activation...' : 'Commencer la configuration'}
              </button>
            </div>
          </form>
        </>
      )}

      {step.kind === 'scan' && (
        <form onSubmit={onConfirm}>
          <div className="tfa__scan">
            <div className="tfa__qr" aria-label="QR code à scanner avec l'application d'authentification" role="img">
              <QRCodeSVG value={step.totpURI} size={184} marginSize={2} />
            </div>
            <ol className="tfa__howto">
              <li>Ouvrez l&apos;application d&apos;authentification sur votre téléphone.</li>
              <li>
                Touchez <strong>+</strong> (ou « Ajouter un compte »).
              </li>
              <li>Choisissez « Scanner un QR code » et visez ce QR code.</li>
              <li>
                L&apos;application affiche <strong>REVIME Admin</strong> avec un code à 6 chiffres.
              </li>
            </ol>
          </div>

          {!manual ? (
            <p className="tfa__hint">
              <button type="button" className="tfa__link" onClick={() => setManual(true)}>
                Je ne peux pas scanner
              </button>
              {' · '}
              <a href={step.totpURI}>Ouvrir dans l&apos;application</a> (si vous êtes sur votre téléphone)
            </p>
          ) : (
            <div className="tfa__box">
              <p className="tfa__box-title">Saisie manuelle</p>
              <p>
                Dans l&apos;application : <strong>+</strong> → « Saisir une clé de configuration » (ou « Saisir
                manuellement »). Compte : <strong>REVIME Admin</strong>. Type : <strong>basé sur l&apos;heure</strong>.
              </p>
              <p className="tfa__key">
                <code>{formatSecretForEntry(secret)}</code>
                <CopyButton text={secret} label="Copier la clé" />
              </p>
            </div>
          )}

          <div>
            <label htmlFor="securite-code">Code à 6 chiffres</label>
            <p className="tfa__hint">
              Le code change toutes les 30 secondes : tapez celui affiché maintenant.
            </p>
            <input
              id="securite-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </div>
          {error && (
            <div role="alert">
              <p>{error}</p>
              <p className="tfa__hint">
                Vérifiez que l&apos;heure de votre téléphone est réglée automatiquement, puis essayez le code
                suivant.
              </p>
            </div>
          )}
          <div>
            <button type="submit" disabled={busy}>
              {busy ? 'Vérification...' : 'Confirmer'}
            </button>
          </div>
        </form>
      )}

      {step.kind === 'codes' && (
        <div>
          <p>
            La double authentification est activée. Voici vos <strong>codes de secours</strong> : chacun permet de
            vous connecter une fois si vous n&apos;avez plus votre téléphone. Ils ne seront plus affichés.
          </p>
          <ul className="tfa__codes">
            {step.backupCodes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <p>
            <CopyButton text={step.backupCodes.join('\n')} label="Copier les codes" />
          </p>
          <p className="tfa__hint">
            Gardez-les dans un gestionnaire de mots de passe ou imprimés, pas sur le même téléphone.
          </p>
          <p className="tfa__hint">
            <strong>Téléphone perdu ?</strong> Connectez-vous avec un code de secours, ou demandez à un Super Admin
            de réinitialiser votre double authentification depuis votre fiche utilisateur.
          </p>
          {/* A full navigation: the gate re-reads admin/me with the new, verified session. */}
          <button type="button" onClick={() => window.location.assign('/')}>
            Je les ai enregistrés
          </button>
        </div>
      )}
    </div>
  );
}
