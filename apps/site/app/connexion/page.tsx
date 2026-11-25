'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HOME_PATH } from '../../lib/client/config';
import { SocialButtons } from '../../components/app/SocialButtons';
import { LoginForm } from '../../components/app/LoginForm';
import { IconShieldCheck } from '../../components/app/icons';

/** Only paths on this site, so a crafted `?suite=` cannot send someone elsewhere after sign-in. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : HOME_PATH;
}

function SignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('suite'));
  return (
    <div className="ap-auth">
      <main id="contenu" className="ap-auth__panel">
        <Link href="/" aria-label="REVIME, accueil" className="ap-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
        </Link>
        <h1>Connexion</h1>
        <p className="ap-muted">Le même compte que dans l’appli REVIME.</p>
        <SocialButtons next={next} />
        <LoginForm onDone={() => router.replace(next)} />
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

export default function ConnexionPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
