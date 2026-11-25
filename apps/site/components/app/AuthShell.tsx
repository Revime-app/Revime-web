import Link from 'next/link';
import { IconShieldCheck } from './icons';

/** The two-panel frame of the account pages (connexion, inscription, mot de passe). */
export function AuthShell({ title, lede, children }: { title: string; lede?: string; children: React.ReactNode }) {
  return (
    <div className="ap-auth">
      <main id="contenu" className="ap-auth__panel">
        <Link href="/" aria-label="REVIME, accueil" className="ap-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
        </Link>
        <h1>{title}</h1>
        {lede && <p className="ap-muted">{lede}</p>}
        {children}
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
