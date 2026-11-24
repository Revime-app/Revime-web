import { LOGO_PUBLIC_URL } from './confirmation-email.template.js';

/**
 * V7 A11 / D3 (U2, U2b). The security e-mails: to a locked account (Q9), to every super admin when a
 * staff account is locked (D3) or secured, and « Nouvelle connexion » (U2b, Q10). Same card layout as
 * the reset e-mail beside them. « Ce n'est pas moi » opens the confirmation page of security.controller.ts.
 */

const parisTime = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(date);
const parisDate = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(date);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function card(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #dfe2e2; overflow: hidden; box-shadow: 0 4px 16px rgba(1, 5, 36, 0.04);">
          <tr>
            <td align="center" style="padding: 36px 32px 24px 32px; background-color: #ffffff;">
              <img src="${LOGO_PUBLIC_URL}" alt="REVIME" width="140" style="display: block; width: 140px; height: auto; border: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px; text-align: center;">
              <h1 style="margin: 0 0 16px 0; color: #010524; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
                ${title}
              </h1>
${bodyHtml}
              <div style="border-top: 1px solid #dfe2e2; padding-top: 24px; text-align: center;">
                <p style="margin: 0 0 12px 0; color: #010524; font-size: 14px; font-weight: 600;">
                  L&rsquo;&eacute;quipe REVIME
                </p>
                <p style="margin: 0; font-size: 12px; line-height: 18px;">
                  <a href="https://www.revime.fr" style="color: #6b7280; text-decoration: none; margin-right: 12px;">www.revime.fr</a>
                  <span style="color: #dfe2e2;">&bull;</span>
                  <a href="mailto:support@revime.fr" style="color: #6b7280; text-decoration: none; margin-left: 12px;">support@revime.fr</a>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const paragraph = (html: string) =>
  `              <p style="margin: 0 0 20px 0; color: #25324f; font-size: 15px; line-height: 22px; text-align: left;">${html}</p>\n`;

/** The quieter second action: « Ce n'est pas moi ». */
const notMeLink = (url: string) =>
  `              <p style="margin: 0 0 28px 0; text-align: center;"><a href="${escapeHtml(url)}" target="_blank" style="color: #f61b39; font-size: 15px; font-weight: 700; text-decoration: underline;">Ce n&rsquo;est pas moi</a></p>\n`;

const button = (url: string, label: string) => `              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(url)}" target="_blank" style="display: inline-block; background-color: #f61b39; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(246, 27, 57, 0.25);">
                      ${label}
                    </a>
                  </td>
                </tr>
              </table>
`;

/** To the locked account. `resetUrl` is a one-hour link; a reset also lifts the lock (Q3). */
export function renderAccountLockedEmail({
  name,
  lockedUntil,
  resetUrl,
  notMeUrl = null,
}: {
  name?: string | null;
  lockedUntil: Date;
  resetUrl: string | null;
  /** U2b: signs out everywhere and asks for a new password. */
  notMeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const until = `${parisDate(lockedUntil)} à ${parisTime(lockedUntil)}`;
  const subject = 'Votre compte REVIME est temporairement bloqué';

  const text = `${greeting}

Plusieurs tentatives de connexion avec un mot de passe incorrect ont eu lieu sur votre compte REVIME. Pour le protéger, nous l'avons bloqué jusqu'au ${until} (heure de Paris).

Si c'était vous, attendez la fin du blocage ou choisissez un nouveau mot de passe, ce qui débloque votre compte tout de suite.${
    resetUrl ? `\n\nChoisir un nouveau mot de passe (lien valable 1 heure) :\n${resetUrl}` : ''
  }

Si ce n'était pas vous, choisissez un nouveau mot de passe dès que possible et contactez-nous à support@revime.fr.${
    notMeUrl ? `\n\nCe n’est pas moi : ${notMeUrl}` : ''
  }

L'équipe REVIME
www.revime.fr · support@revime.fr`;

  const html = card(
    'Compte temporairement bloqu&eacute;',
    `              <p style="margin: 0 0 12px 0; color: #25324f; font-size: 15px; font-weight: 600; text-align: left;">${escapeHtml(greeting)}</p>\n` +
      paragraph(
        `Plusieurs tentatives de connexion avec un mot de passe incorrect ont eu lieu sur votre compte REVIME. Pour le prot&eacute;ger, nous l&rsquo;avons bloqu&eacute; jusqu&rsquo;au <strong>${until}</strong> (heure de Paris).`,
      ) +
      paragraph(
        'Si c&rsquo;&eacute;tait vous, attendez la fin du blocage ou choisissez un nouveau mot de passe, ce qui d&eacute;bloque votre compte tout de suite.',
      ) +
      (resetUrl ? button(resetUrl, 'Choisir un nouveau mot de passe') : '') +
      (notMeUrl ? notMeLink(notMeUrl) : '') +
      `              <p style="margin: 0 0 32px 0; color: #6b7280; font-size: 13px; line-height: 19px;">Si ce n&rsquo;&eacute;tait pas vous, choisissez un nouveau mot de passe d&egrave;s que possible et contactez-nous &agrave; support@revime.fr.${
        resetUrl ? ' Le lien est valable 1 heure.' : ''
      }</p>\n`,
  );
  return { subject, html, text };
}

/** D3: to each super admin when a staff account is locked. */
export function renderStaffLockAlertEmail({
  staffEmail,
  staffName,
  role,
  lockedUntil,
  sheetUrl,
}: {
  staffEmail: string;
  staffName: string | null;
  role: string;
  lockedUntil: Date;
  sheetUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Alerte sécurité : compte d’équipe bloqué';
  const who = staffName ? `${staffName} (${staffEmail})` : staffEmail;
  const until = `${parisDate(lockedUntil)} à ${parisTime(lockedUntil)}`;

  const text = `Le compte d'équipe ${who}, rôle ${role}, a été bloqué après plusieurs échecs de connexion au tableau de bord (mot de passe ou code de double authentification), jusqu'au ${until} (heure de Paris).

Si ce n'est pas un oubli de sa part, quelqu'un essaie peut-être d'accéder au tableau de bord.

Fiche utilisateur : ${sheetUrl}

L'équipe REVIME`;

  const html = card(
    'Compte d&rsquo;&eacute;quipe bloqu&eacute;',
    paragraph(
      `Le compte d&rsquo;&eacute;quipe <strong>${escapeHtml(who)}</strong>, r&ocirc;le ${escapeHtml(role)}, a &eacute;t&eacute; bloqu&eacute; apr&egrave;s plusieurs &eacute;checs de connexion au tableau de bord (mot de passe ou code de double authentification), jusqu&rsquo;au <strong>${until}</strong> (heure de Paris).`,
    ) +
      paragraph('Si ce n&rsquo;est pas un oubli de sa part, quelqu&rsquo;un essaie peut-&ecirc;tre d&rsquo;acc&eacute;der au tableau de bord.') +
      button(sheetUrl, 'Ouvrir la fiche utilisateur'),
  );
  return { subject, html, text };
}

/** U2b (Q10): a password login from a device this account has not used. */
export function renderNewDeviceEmail({
  name,
  label,
  at,
  notMeUrl,
}: {
  name?: string | null;
  label: string;
  at: Date;
  notMeUrl: string | null;
}): { subject: string; html: string; text: string } {
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const when = `${parisDate(at)} à ${parisTime(at)}`;
  const subject = 'Nouvelle connexion à votre compte REVIME';

  const text = `${greeting}

Votre compte REVIME vient d'être utilisé pour se connecter depuis un nouvel appareil :
${label}, le ${when} (heure de Paris).

Si c’était vous, vous n’avez rien à faire.
${notMeUrl ? `\nSi ce n'était pas vous, sécurisez votre compte : nous déconnecterons tous les appareils et vous choisirez un nouveau mot de passe.\nCe n’est pas moi : ${notMeUrl}\n` : ''}
L'équipe REVIME
www.revime.fr · support@revime.fr`;

  const html = card(
    'Nouvelle connexion',
    `              <p style="margin: 0 0 12px 0; color: #25324f; font-size: 15px; font-weight: 600; text-align: left;">${escapeHtml(greeting)}</p>\n` +
      paragraph(
        `Votre compte REVIME vient d&rsquo;&ecirc;tre utilis&eacute; pour se connecter depuis un nouvel appareil : <strong>${escapeHtml(label)}</strong>, le ${when} (heure de Paris).`,
      ) +
      paragraph('Si c&rsquo;&eacute;tait vous, vous n&rsquo;avez rien &agrave; faire.') +
      (notMeUrl
        ? paragraph(
            'Si ce n&rsquo;&eacute;tait pas vous, s&eacute;curisez votre compte : nous d&eacute;connecterons tous les appareils et vous choisirez un nouveau mot de passe.',
          ) + button(notMeUrl, 'Ce n&rsquo;est pas moi')
        : ''),
  );
  return { subject, html, text };
}

/** U2b (Q14): to each super admin when a staff account answers « Ce n'est pas moi ». */
export function renderStaffSecuredAlertEmail({
  staffEmail,
  staffName,
  role,
  at,
  sheetUrl,
}: {
  staffEmail: string;
  staffName: string | null;
  role: string;
  at: Date;
  sheetUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Alerte sécurité : un compte d’équipe a été sécurisé';
  const who = staffName ? `${staffName} (${staffEmail})` : staffEmail;
  const when = `${parisDate(at)} à ${parisTime(at)}`;
  const text = `Le compte d'équipe ${who}, rôle ${role}, a répondu « Ce n'est pas moi » à une alerte de connexion le ${when} (heure de Paris). Tous ses appareils sont déconnectés et son mot de passe doit être changé.

Quelqu'un d'autre a peut-être eu ce mot de passe : vérifiez le journal d'audit.

Fiche utilisateur : ${sheetUrl}

L'équipe REVIME`;
  const html = card(
    'Compte d&rsquo;&eacute;quipe s&eacute;curis&eacute;',
    paragraph(
      `Le compte d&rsquo;&eacute;quipe <strong>${escapeHtml(who)}</strong>, r&ocirc;le ${escapeHtml(role)}, a r&eacute;pondu &laquo; Ce n&rsquo;est pas moi &raquo; &agrave; une alerte de connexion le <strong>${when}</strong> (heure de Paris). Tous ses appareils sont d&eacute;connect&eacute;s et son mot de passe doit &ecirc;tre chang&eacute;.`,
    ) +
      paragraph('Quelqu&rsquo;un d&rsquo;autre a peut-&ecirc;tre eu ce mot de passe : v&eacute;rifiez le journal d&rsquo;audit.') +
      button(sheetUrl, 'Ouvrir la fiche utilisateur'),
  );
  return { subject, html, text };
}
