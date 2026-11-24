/**
 * Time formatting for the inbox and the thread. Mobile-only rather than in
 * `packages/shared`, deliberately: nothing on the server or the admin renders these,
 * and putting it in shared would add a `npm run build` step to every future edit for
 * no consumer.
 *
 * Lifted verbatim from `messages.tsx`, where it was defined privately and could not
 * be reached by the thread screen. The inbox's rendered output must not change.
 */
const pad = (n: number): string => String(n).padStart(2, '0');

/** `HH:MM` for a message sent today, `DD/MM` otherwise. The inbox's row label. */
export function whenLabel(iso: string): string {
  const at = new Date(iso);
  const now = new Date();
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/**
 * Always `HH:MM`, never a date. A bubble sits inside a thread the reader is already
 * scrolling in order, so the day is context the position gives; `whenLabel`'s
 * day-switching would make two bubbles a minute apart read as `23:59` and `12/08`.
 *
 * Day separators between groups of bubbles are deliberately NOT built: where the
 * separator sits and how it reads wants a device, and there is none.
 */
export function timeLabel(iso: string): string {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
