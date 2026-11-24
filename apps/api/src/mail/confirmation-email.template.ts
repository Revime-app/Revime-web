/**
 * Template for REVIME confirmation / OTP emails.
 *
 * Designed according to client specification (CF2-round2):
 * - REVIME logo at the top
 * - White background
 * - Navy blue for main titles and text (#25324f, #010524)
 * - REVIME red only as accent color (#f61b39)
 * - Dedicated highlighted central block for the 6-digit code
 * - Validity notice: 10 minutes
 * - Request disclaimer
 * - Signature: "L'équipe REVIME"
 * - Discreet footer: www.revime.fr & support@revime.fr
 */

export const LOGO_PUBLIC_URL =
  'https://sixgwfsermdfppmzyuzk.supabase.co/storage/v1/object/public/public-assets/revime-logo.png';

export function renderConfirmationEmail(otp: string): { html: string; text: string } {
  const text = `Votre code de confirmation

Votre code de confirmation REVIME est : ${otp}

Ce code est valable 10 minutes.

Si vous n'êtes pas à l'origine de cette demande, vous pouvez simplement ignorer cet e-mail.

L'équipe REVIME
www.revime.fr · support@revime.fr`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre code de confirmation Revime</title>
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
                Votre code de confirmation
              </h1>

              <p style="margin: 0 0 28px 0; color: #25324f; font-size: 15px; line-height: 22px;">
                Pour confirmer votre compte REVIME, saisissez le code ci-dessous dans l&rsquo;application :
              </p>

              <!-- OTP Dedicated Block -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #f0f1f5; border: 1.5px solid #dfe2e2; border-radius: 12px; padding: 18px 36px; text-align: center;">
                      <span style="font-family: 'SF Mono', Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #f61b39; display: inline-block; text-indent: 8px;">${otp}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Notice -->
              <p style="margin: 0 0 10px 0; color: #25324f; font-size: 14px; font-weight: 500; line-height: 20px;">
                Ce code est valable 10 minutes.
              </p>

              <p style="margin: 0 0 32px 0; color: #6b7280; font-size: 13px; line-height: 19px;">
                Si vous n&rsquo;&ecirc;tes pas &agrave; l&rsquo;origine de cette demande, vous pouvez simplement ignorer cet e-mail.
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

  return { html, text };
}

/**
 * 2. Account activation email (with link & button)
 * Matches client ask: "Email sent: Activate your RépareMe account"
 */
export function renderActivationEmail(params: {
  url: string;
  name?: string | null;
}): { html: string; text: string } {
  const { url, name } = params;
  const greeting = name ? `Bonjour ${name}` : 'Bonjour';

  const text = `Activez votre compte REVIME

${greeting},

Bienvenue sur REVIME ! Pour activer votre compte et confirmer votre adresse e-mail, cliquez sur le lien ci-dessous :

${url}

Ce lien est valable pour une durée limitée. Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet e-mail.

L'équipe REVIME
www.revime.fr · support@revime.fr`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activez votre compte Revime</title>
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
                Activez votre compte REVIME
              </h1>

              <p style="margin: 0 0 24px 0; color: #25324f; font-size: 15px; line-height: 22px;">
                ${greeting}, merci de rejoindre REVIME. Pour finaliser la cr&eacute;ation de votre compte et commencer &agrave; utiliser l&rsquo;application, confirmez votre adresse en cliquant ci-dessous :
              </p>

              <!-- CTA Button Block -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${url}" target="_blank" style="display: inline-block; background-color: #f61b39; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(246, 27, 57, 0.25);">
                      Activer mon compte
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 19px;">
                Si le bouton ne fonctionne pas, vous pouvez &eacute;galement copier et coller ce lien dans votre navigateur :
              </p>
              <p style="margin: 0 0 28px 0; word-break: break-all; font-size: 12px; line-height: 18px;">
                <a href="${url}" style="color: #25324f; text-decoration: underline;">${url}</a>
              </p>

              <p style="margin: 0 0 32px 0; color: #6b7280; font-size: 13px; line-height: 19px;">
                Si vous n&rsquo;&ecirc;tes pas &agrave; l&rsquo;origine de cette inscription, vous pouvez simplement ignorer cet e-mail.
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

  return { html, text };
}

/**
 * 3. Account successfully confirmed email
 * Matches client ask: "Email sent: Account successfully confirmed"
 * Warm and reassuring welcome message with next steps to start using the app.
 */
export function renderAccountConfirmedEmail(params: {
  name?: string | null;
}): { html: string; text: string } {
  const { name } = params;
  const greeting = name ? `Bonjour ${name}` : 'Bonjour';

  const text = `Compte confirmé avec succès - Bienvenue sur REVIME

${greeting},

Félicitations ! Vos coordonnées ont été vérifiées avec succès. Votre compte REVIME est désormais actif et sécurisé.

Voici vos prochaines étapes pour profiter pleinement de la plateforme :
1. Publiez votre demande : Décrivez la panne ou l'objet à réparer en quelques clics et recevez des propositions de réparateurs qualifiés.
2. Proposez vos services : Si vous êtes réparateur, explorez les demandes disponibles et envoyez vos offres en toute simplicité.
3. Sécurité garantie : Toutes vos transactions bénéficient de la Protection REVIME.

Rendez-vous sur l'application pour commencer dès maintenant !

L'équipe REVIME
www.revime.fr · support@revime.fr`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compte confirmé avec succès - Bienvenue sur Revime</title>
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
                Compte confirm&eacute; avec succ&egrave;s
              </h1>

              <p style="margin: 0 0 24px 0; color: #25324f; font-size: 15px; line-height: 22px;">
                ${greeting}, f&eacute;licitations ! Vos coordonn&eacute;es ont &eacute;t&eacute; valid&eacute;es avec succ&egrave;s. Votre compte REVIME est d&eacute;sormais pleinement actif et s&eacute;curis&eacute;.
              </p>

              <!-- Next steps card -->
              <div style="background-color: #f0f4f8; border-radius: 12px; border: 1px solid #dfe6ed; padding: 22px; text-align: left; margin: 0 0 28px 0;">
                <p style="margin: 0 0 14px 0; color: #010524; font-size: 15px; font-weight: 700;">
                  Voici vos prochaines &eacute;tapes :
                </p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td valign="top" style="padding-bottom: 12px; width: 24px; color: #f61b39; font-weight: 700; font-size: 16px;">&bull;</td>
                    <td style="padding-bottom: 12px; color: #25324f; font-size: 14px; line-height: 20px;">
                      <strong>Publiez une demande :</strong> D&eacute;crivez la r&eacute;paration souhait&eacute;e et recevez des propositions d&eacute;taill&eacute;es de r&eacute;parateurs qualifi&eacute;s.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" style="padding-bottom: 12px; width: 24px; color: #f61b39; font-weight: 700; font-size: 16px;">&bull;</td>
                    <td style="padding-bottom: 12px; color: #25324f; font-size: 14px; line-height: 20px;">
                      <strong>Proposez vos services :</strong> Si vous &ecirc;tes r&eacute;parateur, explorez les pannes signal&eacute;es pr&egrave;s de chez vous et envoyez vos offres.
                    </td>
                  </tr>
                  <tr>
                    <td valign="top" style="width: 24px; color: #f61b39; font-weight: 700; font-size: 16px;">&bull;</td>
                    <td style="color: #25324f; font-size: 14px; line-height: 20px;">
                      <strong>Protection REVIME :</strong> Vos transactions sont prot&eacute;g&eacute;es et les fonds s&eacute;curis&eacute;s jusqu&rsquo;&agrave; la validation finale de la prestation.
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Button to Website / App -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <a href="https://www.revime.fr" target="_blank" style="display: inline-block; background-color: #010524; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px;">
                      Ouvrir l&rsquo;application
                    </a>
                  </td>
                </tr>
              </table>

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

  return { html, text };
}

export function renderResetPasswordEmail({
  url,
  name,
}: {
  url: string;
  name?: string | null;
}): { html: string; text: string } {
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const text = `${greeting}

Vous avez demandé à réinitialiser votre mot de passe REVIME.

Pour choisir un nouveau mot de passe, cliquez sur ce lien :
${url}

Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, vous pouvez simplement ignorer cet e-mail.

L'équipe REVIME
www.revime.fr · support@revime.fr`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation de votre mot de passe</title>
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
                Réinitialisation de votre mot de passe
              </h1>

              <p style="margin: 0 0 12px 0; color: #25324f; font-size: 15px; font-weight: 600; text-align: left;">
                ${greeting}
              </p>

              <p style="margin: 0 0 28px 0; color: #25324f; font-size: 15px; line-height: 22px; text-align: left;">
                Vous avez demand&eacute; la r&eacute;initialisation de votre mot de passe pour votre compte REVIME. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :
              </p>

              <!-- Reset Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${url}" target="_blank" style="display: inline-block; background-color: #f61b39; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(246, 27, 57, 0.25);">
                      R&eacute;initialiser mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Notice -->
              <p style="margin: 0 0 10px 0; color: #25324f; font-size: 13px; font-weight: 500; line-height: 19px;">
                Ce lien est valable 1 heure.
              </p>

              <p style="margin: 0 0 32px 0; color: #6b7280; font-size: 13px; line-height: 19px;">
                Si vous n&rsquo;&ecirc;tes pas &agrave; l&rsquo;origine de cette demande, vous pouvez simplement ignorer cet e-mail. Votre mot de passe actuel restera inchang&eacute;.
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

  return { html, text };
}
