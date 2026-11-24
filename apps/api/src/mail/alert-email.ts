import type { AdminAlertSeverity, AdminAlertType, AdminAlertTargetType } from '@revime/shared';

export const LOGO_PUBLIC_URL =
  'https://sixgwfsermdfppmzyuzk.supabase.co/storage/v1/object/public/public-assets/revime-logo.png';

export interface AlertEmailPayload {
  type?: AdminAlertType;
  severity: AdminAlertSeverity;
  title: string;
  message: string;
  targetType: AdminAlertTargetType | string;
  targetId: string;
  link: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date;
}

export function buildAlertEmail(alert: AlertEmailPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const adminBaseUrl = process.env.ADMIN_URL || 'https://admin.revime.fr';
  const ctaUrl = alert.link.startsWith('http://') || alert.link.startsWith('https://')
    ? alert.link
    : `${adminBaseUrl}${alert.link.startsWith('/') ? alert.link : `/${alert.link}`}`;

  const severityBadgeColor =
    alert.severity === 'CRITICAL'
      ? '#f61b39'
      : alert.severity === 'HIGH'
        ? '#ea580c'
        : '#25324f';

  const severityLabel =
    alert.severity === 'CRITICAL'
      ? 'Critique'
      : alert.severity === 'HIGH'
        ? 'Élevée'
        : 'Modérée';

  const subject = `[ALERTE REVIME - ${alert.severity}] ${alert.title}`;

  const text = `ALERTE REVIME - ${alert.severity} (${severityLabel})

${alert.title}

${alert.message}

Cible : ${alert.targetType} (${alert.targetId})
Consulter dans le tableau de bord : ${ctaUrl}

L'équipe REVIME
www.revime.fr · support@revime.fr
`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${alert.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #141414;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fa; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 14px; border: 1px solid #dfe2e2; overflow: hidden; box-shadow: 0 4px 16px rgba(1, 5, 36, 0.05);">
          <!-- Header Bar with Brand Color -->
          <tr>
            <td align="center" style="background-color: #25324f; padding: 20px 24px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.2px;">
                REVIME &bull; Alerte Op&eacute;rationnelle
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px 28px 32px 28px;">
              <!-- Severity Badge -->
              <div style="margin-bottom: 16px;">
                <span style="display: inline-block; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; color: #ffffff; background-color: ${severityBadgeColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${severityLabel} (${alert.severity})
                </span>
              </div>

              <!-- Title & Message -->
              <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #141414; line-height: 26px;">
                ${alert.title}
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 22px; color: #25324f;">
                ${alert.message}
              </p>

              <!-- Reference Box -->
              <div style="background-color: #f8f9fa; border: 1px solid #dfe2e2; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px; font-size: 13px; line-height: 19px; color: #25324f;">
                <div><strong>Cible :</strong> ${alert.targetType}</div>
                <div><strong>R&eacute;f&eacute;rence ID :</strong> <code style="font-family: monospace; background: #eef0f3; padding: 2px 6px; border-radius: 4px;">${alert.targetId}</code></div>
              </div>

              <!-- CTA Button in Bleu Ink (#25324f) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; background-color: #25324f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(37, 50, 79, 0.25);">
                      Consulter le dossier &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px; line-height: 18px; text-align: center;">
                Si le bouton ne fonctionne pas, acc&eacute;dez directement via ce lien :
              </p>
              <p style="margin: 0 0 24px 0; word-break: break-all; font-size: 12px; line-height: 18px; text-align: center;">
                <a href="${ctaUrl}" style="color: #25324f; text-decoration: underline;">${ctaUrl}</a>
              </p>

              <!-- Signature -->
              <div style="border-top: 1px solid #dfe2e2; padding-top: 20px; text-align: center;">
                <p style="margin: 0 0 8px 0; color: #141414; font-size: 13px; font-weight: 600;">
                  L&rsquo;&eacute;quipe REVIME
                </p>
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: #6b7280;">
                  www.revime.fr &bull; support@revime.fr
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
