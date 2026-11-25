import Link from 'next/link';
import { PUBLIC_DOCUMENTS, SUPPORT_EMAIL } from '../../lib/documents';

/**
 * On every page of the site: every public document (the stores and Google need the privacy policy
 * and the account-deletion page one click away), and the support address.
 */
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
        <nav aria-label="Informations">
          <ul>
            {PUBLIC_DOCUMENTS.map((d) => (
              <li key={d.slug}>
                <Link href={`/${d.slug}`}>{d.label}</Link>
              </li>
            ))}
            <li>
              <Link href="/suppression-compte">Supprimer votre compte</Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
