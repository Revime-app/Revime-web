/**
 * V7 A11 (U2b, Q5). The « Ce n'est pas moi » pages, served by the API itself: the link is opened from
 * an e-mail, often on a computer, where the app's deep link would go nowhere. Opening the link shows
 * a form; only its button acts, so a mail scanner that opens every link changes nothing.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${title} · REVIME</title>
</head>
<body style="margin: 0; padding: 40px 16px; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #25324f;">
  <main style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #dfe2e2; padding: 32px;">
    <p style="margin: 0 0 24px 0; font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #010524;">REVIME</p>
    <h1 style="margin: 0 0 16px 0; color: #010524; font-size: 22px;">${title}</h1>
${body}
    <p style="margin: 32px 0 0 0; font-size: 13px; color: #6b7280;">Une question ? <a href="mailto:support@revime.fr" style="color: #6b7280;">support@revime.fr</a></p>
  </main>
</body>
</html>`;
}

const p = (html: string) => `    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 22px;">${html}</p>\n`;

export function notMeConfirmPage(token: string): string {
  return page(
    'Sécuriser votre compte',
    p('Vous avez signalé une connexion que vous ne reconnaissez pas. En confirmant :') +
      `    <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 15px; line-height: 24px;">
      <li>tous les appareils connectés à votre compte seront déconnectés ;</li>
      <li>votre mot de passe actuel ne fonctionnera plus, et vous recevrez un e-mail pour en choisir un nouveau.</li>
    </ul>
    <form method="post" action="/api/v1/security/not-me">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit" style="width: 100%; background-color: #f61b39; color: #ffffff; border: 0; border-radius: 10px; padding: 14px 24px; font-size: 15px; font-weight: 700; cursor: pointer;">Sécuriser mon compte</button>
    </form>
`,
  );
}

export function notMeDonePage(hadPassword: boolean): string {
  return page(
    'Votre compte est sécurisé',
    p('Tous les appareils connectés à votre compte ont été déconnectés.') +
      (hadPassword
        ? p('Vous allez recevoir un e-mail pour choisir un nouveau mot de passe. Votre ancien mot de passe ne fonctionne plus.')
        : p('Votre compte se connecte avec Google ou Apple : sécurisez aussi ce compte-là (changez son mot de passe) avant de vous reconnecter.')),
  );
}

export function notMeInvalidPage(): string {
  return page(
    'Ce lien n’est plus valable',
    p('Ce lien a déjà servi ou a expiré (il est valable 7 jours). Si vous pensez que quelqu’un utilise votre compte, choisissez un nouveau mot de passe depuis « Mot de passe oublié » dans l’application, ou écrivez-nous.'),
  );
}
