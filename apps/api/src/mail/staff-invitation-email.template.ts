import { ADMIN_ROLE_LABEL, type AdminRole } from '@revime/shared';

export const LOGO_PUBLIC_URL =
  'https://sixgwfsermdfppmzyuzk.supabase.co/storage/v1/object/public/public-assets/revime-logo.png';

export type StaffInvitationEmailParams = {
  url: string;
  role: AdminRole;
  firstName?: string | null;
  inviterName?: string | null;
};

export function renderStaffInvitationEmail(params: StaffInvitationEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { url, role, firstName, inviterName } = params;
  const roleLabel = ADMIN_ROLE_LABEL[role] ?? role;
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const inviterClause = inviterName ? ` par ${inviterName}` : '';

  const subject = `Invitation à rejoindre l'équipe REVIME`;

  const text = `${subject}

${greeting}

Vous avez été invité(e)${inviterClause} à rejoindre l'espace d'administration REVIME avec le rôle suivant : ${roleLabel}.

Pour accepter cette invitation et configurer votre mot de passe, cliquez sur le lien ci-dessous :

${url}

Ce lien est valable 7 jours et ne peut être utilisé qu'une seule fois.

Si vous n'êtes pas à l'origine de cette invitation ou pensez qu'il s'agit d'une erreur, vous pouvez simplement ignorer cet e-mail.

L'équipe REVIME
www.revime.fr · support@revime.fr`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation à rejoindre l'équipe REVIME</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #dfe2e2; overflow: hidden; box-shadow: 0 4px 16px rgba(1, 5, 36, 0.04);">
          <!-- Header with Logo -->
          <tr>
            <td align="center" style="padding: 36px 32px 24px 32px; background-color: #ffffff;">
              <img src="${LOGO_PUBLIC_URL}" alt="REVIME" width="140" style="display: block; width: 140px; height: auto; border: 0;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 32px 32px 32px; text-align: center;">
              <h1 style="margin: 0 0 16px 0; color: #010524; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
                Invitation à rejoindre l'équipe REVIME
              </h1>

              <p style="margin: 0 0 20px 0; color: #25324f; font-size: 15px; line-height: 22px;">
                ${greeting}
              </p>

              <p style="margin: 0 0 24px 0; color: #25324f; font-size: 15px; line-height: 22px;">
                Vous avez &eacute;t&eacute; invit&eacute;(e)${inviterClause ? ` par <strong>${inviterName}</strong>` : ''} &agrave; rejoindre l&rsquo;espace d&rsquo;administration REVIME en tant que :
              </p>

              <!-- Role Badge -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #f0f1f5; border: 1.5px solid #dfe2e2; border-radius: 12px; padding: 12px 28px; text-align: center;">
                      <span style="font-size: 16px; font-weight: 700; color: #010524;">${roleLabel}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px 0; color: #25324f; font-size: 15px; line-height: 22px;">
                Pour finaliser votre acc&egrave;s et configurer votre mot de passe, cliquez sur le bouton ci-dessous :
              </p>

              <!-- CTA Button Block -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${url}" target="_blank" style="display: inline-block; background-color: #f61b39; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(246, 27, 57, 0.25);">
                      Accepter l'invitation et cr&eacute;er mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 19px;">
                Si le bouton ne fonctionne pas, vous pouvez &eacute;galement copier et coller ce lien dans votre navigateur :
              </p>
              <p style="margin: 0 0 24px 0; word-break: break-all; font-size: 12px; line-height: 18px;">
                <a href="${url}" style="color: #25324f; text-decoration: underline;">${url}</a>
              </p>

              <!-- Security notice -->
              <p style="margin: 0 0 10px 0; color: #25324f; font-size: 14px; font-weight: 500; line-height: 20px;">
                Ce lien est valable 7 jours et ne peut &ecirc;tre utilis&eacute; qu&rsquo;une seule fois.
              </p>

              <p style="margin: 0 0 32px 0; color: #6b7280; font-size: 13px; line-height: 19px;">
                Si vous n&rsquo;&ecirc;tes pas &agrave; l&rsquo;origine de cette invitation ou pensez qu'il s'agit d'une erreur, vous pouvez simplement ignorer cet e-mail.
              </p>

              <!-- Signature -->
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

  return { subject, html, text };
}
