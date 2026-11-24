import {
  BUSINESS_REQUIRED_AT_CAP_TEXT,
  PARTICULAR_CAP_REACHED_TEXT,
  PARTICULAR_CAP_WARNING_TEXT,
  type MyParticularQuotaResponse,
} from '@revime/shared';

/**
 * V7 A10 (U7, `DEC7-22`). What the private individual's CGU art. 53 counter says on Profil (Q4),
 * on the offer form (Q5, Q7) and on the « Mon entreprise » card (Q8). Pure, so the three screens
 * read one answer. The figures, the standing and the refusal sentence all come from
 * `GET /users/me/particular-quota`; nothing here counts.
 *
 * The response is read through `?.` and `?? null` at entry: an API older than U7 answers 404, so the
 * query has no data, and every helper then shows what the app showed before (AGENTS.md, new DTO field).
 */

export type QuotaCardView = {
  tone: 'normal' | 'warning' | 'blocked';
  missionsLine: string;
  amountLine: string;
  missionsPercent: number;
  amountPercent: number;
  releaseLine: string;
  /** The 80 % warning, or the cap's refusal; null below 80 %. */
  notice: string | null;
  /** « Mon entreprise », at the cap only. */
  showBusinessButton: boolean;
};

export type OfferCapNoticeState =
  | { kind: 'none' }
  | { kind: 'warning'; text: string }
  | { kind: 'blocked'; text: string };

/** Whole euros, French grouping with a no-break space so « 1 500 € » never wraps, as on the dashboard. */
function wholeEuros(cents: number): string {
  const grouped = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} €`;
}

function percent(value: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
}

/** The device's own day, like the app's other dates (`when.ts`, `entreprise.tsx`), as the dashboard does. */
function frenchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function quotaCardView(res: MyParticularQuotaResponse | undefined): QuotaCardView | null {
  const quota = res?.quota ?? null;
  if (!quota) return null;
  const blockedMessage = res?.offerBlockedMessage ?? null;

  const tone = quota.standing === 'REACHED' ? 'blocked' : quota.standing === 'WARNING' ? 'warning' : 'normal';
  const releaseAt = quota.nextMissionReleaseAt ?? null;
  return {
    tone,
    missionsLine: `Missions payées : ${quota.missionsCount} / ${quota.missionsMax}`,
    amountLine: `Montant encaissé : ${wholeEuros(quota.amountCollectedCents)} / ${wholeEuros(quota.amountMaxCents)}`,
    missionsPercent: percent(quota.missionsCount, quota.missionsMax),
    amountPercent: percent(quota.amountCollectedCents, quota.amountMaxCents),
    releaseLine: releaseAt
      ? `Prochaine mission libérée le ${frenchDate(releaseAt)}.`
      : 'Aucune mission payée sur les 12 derniers mois.',
    notice:
      tone === 'blocked'
        ? (blockedMessage ?? PARTICULAR_CAP_REACHED_TEXT)
        : tone === 'warning'
          ? PARTICULAR_CAP_WARNING_TEXT
          : null,
    showBusinessButton: tone === 'blocked',
  };
}

/**
 * The offer form's notice. `refusal` is the message of a `PARTICULAR_CAP_REACHED` answer to this
 * very form's submit: the server is the authority, so it blocks even while the cached counter still
 * reads 9 missions (a payment landed since it was fetched).
 */
export function offerCapNotice(
  res: MyParticularQuotaResponse | undefined,
  refusal: string | null,
): OfferCapNoticeState {
  if (refusal) return { kind: 'blocked', text: refusal };
  const view = quotaCardView(res);
  if (!view || !view.notice) return { kind: 'none' };
  return view.tone === 'blocked' ? { kind: 'blocked', text: view.notice } : { kind: 'warning', text: view.notice };
}

const BUSINESS_OPTIONAL_TEXT =
  'Facultatif : vérifiez votre SIREN ou SIRET pour afficher le badge « Professionnel vérifié ».';

/** The « Mon entreprise » card's line for an account not yet at BUSINESS (Q8). */
export function businessCardLine(res: MyParticularQuotaResponse | undefined): string {
  return res?.quota?.standing === 'REACHED' ? BUSINESS_REQUIRED_AT_CAP_TEXT : BUSINESS_OPTIONAL_TEXT;
}
