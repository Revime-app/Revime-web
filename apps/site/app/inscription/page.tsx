'use client';

import Link from 'next/link';
import { Suspense, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authErrorMessageFr, signUpSchema } from '@revime/shared';
import { authClient } from '../../lib/client/auth';
import { api, ApiError } from '../../lib/client/api';
import { DEMO, HOME_PATH, setDemoSignedIn } from '../../lib/client/config';
import { useSession } from '../../lib/client/session';
import { SocialButtons } from '../../components/app/SocialButtons';
import { IconArrowLeft, IconArrowRight, IconShieldCheck } from '../../components/app/icons';
import { RepairerKindPicker } from '../../components/app/RepairerKindPicker';

/**
 * Account creation, in the app's order (apps/mobile/app/(auth)/roles.tsx → type-reparateur.tsx →
 * signup.tsx → verification.tsx, never changed):
 *   1. « Choisissez votre expérience » : the client card or the réparateur card;
 *   2. réparateur only: Particulier or Professionnel;
 *   3. the form (Prénom, Nom, Nom d'utilisateur, e-mail, téléphone, mot de passe, CGU, confidentialité);
 *   4. the modes (`PATCH /users/me/modes`), then the e-mail and phone checks.
 * The step lives in the URL (`?etape=type`, `?etape=compte&client=1`, `?etape=compte&repairer=1&kind=PRO`)
 * so the browser's back button walks back through the steps like the app's back gesture.
 */
type Kind = 'INDIVIDUAL' | 'PRO';

function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

const FIELD_FOR_CODE: Record<string, string> = {
  CGU_REQUIRED: 'cguAccepted',
  PRIVACY_REQUIRED: 'privacyAccepted',
  USERNAME_ALREADY_EXISTS: 'username',
  INVALID_USERNAME: 'username',
  PHONE_ALREADY_EXISTS: 'phone',
  INVALID_PHONE: 'phone',
};

function Field({
  label,
  name,
  error,
  helper,
  ...input
}: { label: string; name: string; error?: string; helper?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="ap-field">
      <span>{label}</span>
      <input name={name} aria-invalid={error ? true : undefined} {...input} />
      {error && <em className="ap-field__error">{error}</em>}
      {helper && !error && <small className="ap-field__hint">{helper}</small>}
    </label>
  );
}

function Head({ title, sub, accent }: { title: React.ReactNode; sub: string; accent?: boolean }) {
  return (
    <div className="ap-signup__head">
      <Link href="/" aria-label="REVIME, accueil" className="ap-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
      </Link>
      <h1 className={accent ? 'ap-signup__title' : undefined}>{title}</h1>
      <p className="ap-muted">{sub}</p>
    </div>
  );
}

/** Step 1, the app's roles screen: two big cards, red for the client, Bleu Ink for the réparateur. */
function RolesStep({ go }: { go: (q: string) => void }) {
  return (
    <>
      <Head
        accent
        title={
          <>
            <span className="ap-accent">Choisissez</span> votre expérience.
          </>
        }
        sub="Revime met en relation les particuliers et les réparateurs de confiance."
      />
      <div className="ap-role2s">
        <button type="button" className="ap-role2 ap-role2--client" onClick={() => go('etape=compte&client=1')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ap-role2__art" src="/illustrations/banner1.webp" alt="" />
          <span className="ap-role2__body">
            <span className="ap-role2__eyebrow">Je suis client</span>
            <strong className="ap-role2__title">
              Faire réparer
              <br />
              un objet
            </strong>
            <span className="ap-role2__desc">Publiez, comparez, choisissez.</span>
            <span className="ap-role2__badges">
              <span>Paiement sécurisé</span>
              <span>Réparateurs vérifiés</span>
            </span>
          </span>
          <span className="ap-role2__go" aria-hidden="true">
            <IconArrowRight size={20} />
          </span>
        </button>
        <button type="button" className="ap-role2 ap-role2--pro" onClick={() => go('etape=type')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ap-role2__art" src="/illustrations/repair-toolbox.webp" alt="" />
          <span className="ap-role2__body">
            <span className="ap-role2__eyebrow">Je suis réparateur</span>
            <strong className="ap-role2__title">
              Proposer mes
              <br />
              réparations
            </strong>
            <span className="ap-role2__desc">Recevez des demandes, envoyez vos offres.</span>
            <span className="ap-role2__badges">
              <span>Recevez des demandes</span>
              <span>Paiement garanti</span>
            </span>
          </span>
          <span className="ap-role2__go" aria-hidden="true">
            <IconArrowRight size={20} />
          </span>
        </button>
      </div>
      <div className="ap-signup__foot">
        <p className="ap-signup__trust">
          <span>
            <IconShieldCheck size={14} /> Paiement sécurisé
          </span>
          <span>
            <IconShieldCheck size={14} /> Réparateurs vérifiés
          </span>
        </p>
        <p className="ap-muted">
          Un seul compte. Deux expériences.
          <br />
          Passez du mode Client au mode Réparateur en un clic.
        </p>
        <p className="ap-hint">
          Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
        </p>
      </div>
    </>
  );
}

/** Step 2, the app's « Type de réparateur » (RepairerKindPicker). */
function TypeStep({ go, back }: { go: (q: string) => void; back: () => void }) {
  return (
    <>
      <button type="button" className="ap-back" onClick={back} aria-label="Retour">
        <IconArrowLeft size={18} />
      </button>
      <Head title="Type de réparateur" sub="Vous pourrez vérifier votre identité juste après la création de votre compte." />
      <h2 className="ap-signup__prompt">Choisissez votre statut</h2>
      <RepairerKindPicker onChoose={(kind) => go(`etape=compte&repairer=1&kind=${kind}`)} />
    </>
  );
}

/** Step 3, the app's signup form, field for field. */
function FormStep({ repairer, kind, next, back }: { repairer: boolean; kind: Kind | null; next: string | null; back: () => void }) {
  const router = useRouter();
  const { refresh } = useSession();
  const created = useRef<string | null>(null);
  const [f, setF] = useState({ firstName: '', lastName: '', username: '', email: '', phone: '', password: '', confirm: '' });
  const [cgu, setCgu] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const after = repairer ? '/statut-verification' : next ?? HOME_PATH;
  const toVerification = () => router.push(`/verification?suite=${encodeURIComponent(after)}`);

  async function applyModes() {
    await api.patch('/users/me/modes', {
      clientEnabled: !repairer,
      repairerEnabled: repairer,
      activeMode: repairer ? 'REPAIRER' : 'CLIENT',
      ...(repairer ? { kind: kind ?? 'INDIVIDUAL' } : {}),
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setModeError(null);
    if (f.password !== f.confirm) {
      setErrors({ confirm: 'Les mots de passe ne correspondent pas' });
      return;
    }
    const parsed = signUpSchema.safeParse({
      firstName: f.firstName,
      lastName: f.lastName,
      username: f.username,
      email: f.email,
      phone: f.phone,
      password: f.password,
      cguAccepted: cgu,
      privacyAccepted: privacy,
      marketingConsent: marketing,
    });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? 'email');
        out[k] ??= issue.message;
      }
      setErrors(out);
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    setBusy(true);
    try {
      // Back from the verification screen: the account exists, do not create it twice.
      if (created.current === email) {
        await refresh();
        toVerification();
        return;
      }
      if (DEMO) {
        setDemoSignedIn(true);
      } else {
        const d = parsed.data;
        // Better Auth's typed client does not know the API's extra sign-up fields.
        const signUp = authClient.signUp.email as unknown as (input: Record<string, unknown>) => Promise<{
          error: { code?: string } | null;
        }>;
        const res = await signUp({
          email: d.email,
          password: d.password,
          name: `${d.firstName.trim()} ${d.lastName.trim()}`.trim(),
          firstName: d.firstName.trim(),
          lastName: d.lastName.trim(),
          username: d.username,
          phone: d.phone,
          cguAccepted: true,
          privacyAccepted: true,
          marketingConsent: d.marketingConsent,
        });
        if (res.error) {
          const code = res.error.code ?? '';
          setErrors({ [FIELD_FOR_CODE[code] ?? 'email']: authErrorMessageFr(code, 'Erreur lors de la création du compte.') });
          return;
        }
        created.current = email;
        try {
          await applyModes();
        } catch {
          setModeError('Compte créé, mais erreur lors de la configuration du mode. Veuillez réessayer.');
          return;
        }
      }
      await refresh();
      toVerification();
    } catch {
      setErrors({ email: 'Une erreur est survenue. Veuillez réessayer.' });
    } finally {
      setBusy(false);
    }
  }

  async function retryMode() {
    setModeError(null);
    setBusy(true);
    try {
      await applyModes();
      await refresh();
      toVerification();
    } catch (err) {
      setModeError(err instanceof ApiError ? err.message : 'Erreur lors de la configuration du mode. Veuillez réessayer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="ap-back" onClick={back} aria-label="Retour">
        <IconArrowLeft size={18} />
      </button>
      <Head title="Créer votre compte" sub="Rejoignez Revime pour réparer ou proposer vos services." />

      {modeError && (
        <div className="ap-banner" role="alert">
          <p>{modeError}</p>
          <p>
            <button type="button" className="ap-link" onClick={() => void retryMode()} disabled={busy}>
              Réessayer
            </button>
            {' · '}
            <button
              type="button"
              className="ap-link"
              disabled={busy}
              onClick={async () => {
                await refresh();
                toVerification();
              }}
            >
              Continuer quand même
            </button>
          </p>
        </div>
      )}

      <SocialButtons next={after} />

      <form className="ap-form" onSubmit={submit} noValidate>
        <Field label="Prénom" name="firstName" autoComplete="given-name" placeholder="Camille" value={f.firstName} onChange={set('firstName')} error={errors.firstName} disabled={busy} />
        <Field label="Nom" name="lastName" autoComplete="family-name" placeholder="Martin" value={f.lastName} onChange={set('lastName')} error={errors.lastName} disabled={busy} />
        <Field
          label="Nom d'utilisateur"
          helper="C'est ce que les autres utilisateurs voient. Votre nom et votre prénom restent privés."
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="camille_m"
          value={f.username}
          onChange={set('username')}
          error={errors.username}
          disabled={busy}
        />
        <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" autoCapitalize="none" value={f.email} onChange={set('email')} error={errors.email} disabled={busy} />
        <Field label="Téléphone" name="phone" type="tel" autoComplete="tel" placeholder="06 12 34 56 78" value={f.phone} onChange={set('phone')} error={errors.phone} disabled={busy} />
        <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} disabled={busy} />
        <Field label="Confirmer le mot de passe" name="confirm" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} disabled={busy} />

        <label className="ap-check" data-error={errors.cguAccepted ? true : undefined}>
          <input type="checkbox" checked={cgu} onChange={(e) => setCgu(e.target.checked)} disabled={busy} />
          <span>
            J&apos;accepte les <Link href="/cgu" target="_blank">Conditions générales d&apos;utilisation</Link>
          </span>
        </label>
        {errors.cguAccepted && <em className="ap-field__error ap-check__error">{errors.cguAccepted}</em>}
        <label className="ap-check" data-error={errors.privacyAccepted ? true : undefined}>
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} disabled={busy} />
          <span>
            J&apos;accepte la <Link href="/confidentialite" target="_blank">Politique de confidentialité</Link>
          </span>
        </label>
        {errors.privacyAccepted && <em className="ap-field__error ap-check__error">{errors.privacyAccepted}</em>}
        <label className="ap-check ap-check--soft">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} disabled={busy} />
          <span>J&apos;accepte de recevoir des communications commerciales de REVIME par e-mail et SMS (facultatif).</span>
        </label>

        <button className="ap-btn ap-btn--primary ap-btn--block ap-btn--lg" disabled={busy}>
          {busy ? 'Création du compte…' : 'Créer mon compte'}
        </button>
        <p className="ap-hint">
          Vous avez déjà un compte ? <Link href={next ? `/connexion?suite=${encodeURIComponent(next)}` : '/connexion'}>Se connecter</Link>
        </p>
      </form>
    </>
  );
}

function SignUp() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('suite'));
  const legacyPro = params.get('role') === 'reparateur';
  const step = params.get('etape') ?? (legacyPro ? 'type' : 'roles');
  const repairer = params.get('repairer') === '1';
  const kindParam = params.get('kind');
  const kind: Kind | null = kindParam === 'PRO' ? 'PRO' : kindParam === 'INDIVIDUAL' ? 'INDIVIDUAL' : null;

  const go = (q: string) => router.push(`/inscription?${q}${next ? `&suite=${encodeURIComponent(next)}` : ''}`);
  const back = () => router.back();

  // The colour follows the role, as in the app: Bleu Ink as soon as the réparateur door is taken.
  const pro = step === 'type' || (step === 'compte' && repairer);

  return (
    <div className="ap-auth" data-mode={pro ? 'pro' : undefined}>
      <main id="contenu" className="ap-auth__panel ap-signup">
        {step === 'type' ? (
          <TypeStep go={go} back={back} />
        ) : step === 'compte' ? (
          <FormStep repairer={repairer} kind={kind} next={next} back={back} />
        ) : (
          <RolesStep go={go} />
        )}
      </main>
      <aside className="ap-auth__side" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pro ? '/illustrations/repair-toolbox.webp' : '/illustrations/banner1.webp'} alt="" />
        <p>
          {pro
            ? 'Recevez des demandes près de chez vous et envoyez vos offres. Paiement garanti.'
            : 'Comparez les offres de réparateurs vérifiés. Payez seulement quand c’est réparé.'}
        </p>
        <span>
          <IconShieldCheck size={18} /> Protection REVIME sur chaque réparation
        </span>
      </aside>
    </div>
  );
}

export default function InscriptionPage() {
  return (
    <Suspense>
      <SignUp />
    </Suspense>
  );
}
