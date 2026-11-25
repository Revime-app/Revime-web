import Link from 'next/link';
import { PUBLIC_DOCUMENTS, SUPPORT_EMAIL } from '../../lib/documents';

/**
 * Compact, like the marketplaces it is modelled on (Leboncoin, Murfy): three short columns of
 * site links, then every public document on one small line (the stores and Google need the
 * privacy policy and the account-deletion page one click away), and the support address.
 */
const COLUMNS = [
  {
    title: 'Faire réparer',
    links: [
      ['/publier', 'Publier une demande'],
      ['/reparateurs', 'Trouver un réparateur'],
      ['/reparation', 'Tout ce qu’on répare'],
      ['/protection-revime', 'Protection REVIME'],
    ],
  },
  {
    title: 'Réparateurs',
    links: [
      ['/devenir-reparateur', 'Devenir réparateur'],
      ['/demandes', 'Demandes en cours'],
      ['/inscription?role=reparateur', 'Créer un compte réparateur'],
    ],
  },
  {
    title: 'REVIME',
    links: [
      ['/comment-ca-marche', 'Comment ça marche'],
      ['/qui-sommes-nous', 'Qui sommes-nous'],
      ['/aide', 'Aide et questions'],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="ap-footer">
      <div className="ap-footer__in">
        <div className="ap-footer__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/revime-logo.png" alt="REVIME" width={113} height={20} />
          <p>La réparation de tous vos objets, par des réparateurs vérifiés près de chez vous.</p>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="ap-footer__col">
            <p className="ap-footer__h">{c.title}</p>
            <ul>
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="ap-footer__legal">
        <nav aria-label="Informations légales">
          <span>© {new Date().getFullYear()} REVIME</span>
          {PUBLIC_DOCUMENTS.map((d) => (
            <Link key={d.slug} href={`/${d.slug}`}>
              {d.label}
            </Link>
          ))}
          <Link href="/suppression-compte">Supprimer votre compte</Link>
        </nav>
      </div>
    </footer>
  );
}
