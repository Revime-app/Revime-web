'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authErrorMessageFr, signUpSchema } from '@revime/shared';
import { authClient } from '../../lib/client/auth';
import { api } from '../../lib/client/api';
import { DEMO, HOME_PATH, setDemoSignedIn } from '../../lib/client/config';
import { useSession } from '../../lib/client/session';
import { SocialButtons } from '../../components/app/SocialButtons';
import { IconShieldCheck } from '../../components/app/icons';

/**
 * Account creation, the app's « Créer un compte » (apps/mobile/app/(auth)/signup.tsx, never
 * changed): same fields, same `signUpSchema`, same required CGU and privacy boxes, the optional
 * marketing box, then the modes (`PATCH /users/me/modes`) and the e-mail and phone checks.
 */
type Role = 'client' | 'pro' | 'particulier';

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : HOME_PATH;
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
  hint,
  ...input
}: { label: string; name: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="ap-field">
      <span>{label}</span>
      {hint && <small className="ap-field__hint">{hint}</small>}
      <input name={name} aria-invalid={error ? true : undefined} {...input} />
      {error && <em className="ap-field__error">{error}</em>}
    </label>
  );
}

function SignUp() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('suite'));
  const { refresh } = useSession();
  const [role, setRole] = useState<Role>(params.get('role') === 'reparateur' ? 'pro' : 'client');
  const [f, setF] = useState({ firstName: '', lastName: '', username: '', email: '', phone: '', password: '', confirm: '' });
  const [cgu, setCgu] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (f.password !== f.confirm) {
      setErrors({ confirm: 'Les mots de passe ne correspondent pas.' });
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
    setBusy(true);
    try {
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
          name: `${d.firstName} ${d.lastName}`.trim(),
          firstName: d.firstName,
          lastName: d.lastName,
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
        await api.patch('/users/me/modes', {
          clientEnabled: role === 'client',
          repairerEnabled: role !== 'client',
          activeMode: role === 'client' ? 'CLIENT' : 'REPAIRER',
          ...(role === 'client' ? {} : { kind: role === 'pro' ? 'PRO' : 'INDIVIDUAL' }),
        }).catch(() => {
          /* the account exists with client mode (the server default); the mode can be set in Paramètres */
        });
      }
      await refresh();
      router.replace(`/verification?suite=${encodeURIComponent(next)}`);
    } catch {
      setErrors({ email: 'Une erreur est survenue. Réessayez.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-auth">
      <main id="contenu" className="ap-auth__panel">
        <Link href="/" aria-label="REVIME, accueil" className="ap-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
        </Link>
        <h1>Créer un compte</h1>
        <p className="ap-muted">Un seul compte pour le site et l’appli REVIME. Environ 2 minutes.</p>

        <SocialButtons next={next} />

        <form className="ap-form" onSubmit={submit} noValidate>
          <fieldset className="ap-roles">
            <legend>Vous venez pour</legend>
            {(
              [
                ['client', 'Faire réparer mes objets', 'Publier une demande, comparer les offres'],
                ['pro', 'Réparer, en tant que professionnel', 'Vous avez un SIRET'],
                ['particulier', 'Réparer, en tant que particulier', 'Jusqu’à 10 missions ou 1 500 € par an'],
              ] as const
            ).map(([v, l, s]) => (
              <label key={v} className="ap-choice" data-active={role === v || undefined}>
                <input type="radio" name="role" checked={role === v} onChange={() => setRole(v)} />
                <span>
                  <strong>{l}</strong>
                  <small>{s}</small>
                </span>
              </label>
            ))}
            <small className="ap-field__hint">Vous pourrez activer l’autre mode plus tard dans Paramètres.</small>
          </fieldset>

          <div className="ap-row2">
            <Field label="Prénom" name="firstName" autoComplete="given-name" value={f.firstName} onChange={set('firstName')} error={errors.firstName} />
            <Field label="Nom" name="lastName" autoComplete="family-name" value={f.lastName} onChange={set('lastName')} error={errors.lastName} />
          </div>
          <Field
            label="Nom d’utilisateur"
            hint="Visible par les autres membres à la place de votre nom complet."
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            value={f.username}
            onChange={set('username')}
            error={errors.username}
          />
          <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} />
          <Field
            label="Téléphone mobile"
            hint="Pour vérifier votre compte par SMS. Jamais affiché."
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="06 12 34 56 78"
            value={f.phone}
            onChange={set('phone')}
            error={errors.phone}
          />
          <Field
            label="Mot de passe"
            hint="Au moins 8 caractères."
            name="password"
            type="password"
            autoComplete="new-password"
            value={f.password}
            onChange={set('password')}
            error={errors.password}
          />
          <Field label="Confirmez le mot de passe" name="confirm" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} />

          <label className="ap-check">
            <input type="checkbox" checked={cgu} onChange={(e) => setCgu(e.target.checked)} />
            <span>
              J’accepte les <Link href="/cgu" target="_blank">Conditions générales d’utilisation</Link>
            </span>
          </label>
          {errors.cguAccepted && <em className="ap-field__error">{errors.cguAccepted}</em>}
          <label className="ap-check">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span>
              J’accepte la <Link href="/confidentialite" target="_blank">Politique de confidentialité</Link>
            </span>
          </label>
          {errors.privacyAccepted && <em className="ap-field__error">{errors.privacyAccepted}</em>}
          <label className="ap-check ap-check--soft">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span>J’accepte de recevoir des communications commerciales de REVIME par e-mail et SMS (facultatif).</span>
          </label>

          <button className="ap-btn ap-btn--primary ap-btn--block ap-btn--lg" disabled={busy}>
            {busy ? 'Création du compte…' : 'Créer mon compte'}
          </button>
          <p className="ap-hint">
            Vous avez déjà un compte ? <Link href={`/connexion?suite=${encodeURIComponent(next)}`}>Se connecter</Link>
          </p>
        </form>
      </main>
      <aside className="ap-auth__side" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/illustrations/repair-toolbox.webp" alt="" />
        <p>Comparez les offres de réparateurs vérifiés. Payez seulement quand c’est réparé.</p>
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
