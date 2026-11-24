import {
  ATTENTION_REASON_LABEL,
  type AdminAttentionItem,
  type AdminAttentionReason,
} from '@revime/shared';
import { mailSender, type Mail } from '../mail/mail.service.js';

/**
 * The operator's digest of commandes needing attention. Fires only when the list
 * is non-empty: a digest that also says "nothing to report" trains an operator
 * to ignore it.
 *
 * Returns null when OPS_EMAIL is unset, so the caller can log loudly rather than
 * silently dropping the work. It carries commande ids, reasons and amounts, and
 * NO addresses or phone numbers: `ConsoleMailSender` prints the body verbatim,
 * so on any environment where `MAIL_DRIVER !== 'resend'` or `RESEND_API_KEY` is
 * unset while `OPS_EMAIL` **is** set, this body lands in the host's log stream.
 *
 * `demandeTitle` is user-authored free text and is truncated here to 60
 * characters. The "no PII" guarantee covers known-PII columns (addresses, phone
 * numbers) but cannot guarantee user-entered text is PII-free.
 */
export function buildAttentionMail(items: AdminAttentionItem[]): Mail | null {
  if (items.length === 0) return null;
  const to = process.env.OPS_EMAIL;
  if (!to) return null;

  const lines = items.map((item) => {
    const amount = (item.totalCents / 100).toFixed(2);
    // Truncate user-authored free text to limit PII exposure when
    // ConsoleMailSender prints the body to the log stream.
    const title = item.demandeTitle.length > 60
      ? item.demandeTitle.slice(0, 60) + '...'
      : item.demandeTitle;
    const label =
      item.reasons && item.reasons.length > 0
        ? item.reasons.map((r) => ATTENTION_REASON_LABEL[r as AdminAttentionReason] ?? r).join(', ')
        : item.reason
          ? ATTENTION_REASON_LABEL[item.reason as AdminAttentionReason] ?? item.reason
          : '';
    return [
      `${item.commandeId} - ${title}`,
      `  ${label}`,
      `  Statut : ${item.status}${item.step && item.status !== 'REFUNDED' ? ` / ${item.step}` : ''}`,
      `  ${amount} € · Depuis ${new Date(item.since).toLocaleDateString('fr-FR')}`,
    ].join('\n');
  });

  return {
    to,
    subject: `Revime - ${items.length} commande${items.length > 1 ? 's' : ''} nécessit${items.length > 1 ? 'ent' : 'e'} votre attention`,
    text: [
      `${items.length} commande${items.length > 1 ? 's' : ''} nécessit${items.length > 1 ? 'ent' : 'e'} votre attention :`,
      '',
      ...lines,
      '',
      "Voir l'administration pour les détails.",
    ].join('\n'),
  };
}

/** Never throws - enforced, not merely documented. A failed notification must
 *  not undo the reconciliation work. */
export async function sendAttentionMail(items: AdminAttentionItem[]): Promise<void> {
  try {
    const mail = buildAttentionMail(items);
    if (!mail) {
      if (items.length > 0) {
        console.error(
          '[cron] OPS_EMAIL is unset - %d attention item(s) cannot be sent',
          items.length,
        );
      }
      return;
    }
    await mailSender().send(mail);
  } catch (error) {
    console.error(
      '[cron] failed to send attention mail - %d item(s) not notified',
      items.length,
      error,
    );
  }
}
