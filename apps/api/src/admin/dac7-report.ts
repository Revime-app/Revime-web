import type { AdminExportColumnDef } from '@revime/shared';
import type { Commande, Prisma } from '../generated/prisma/client.js';
import { maskIbanLast4 } from '../connect/iban-mask.js';
import { isFiscalComplete } from '../fiscal/fiscal-gate.js';

/**
 * CMP-D4, the DAC7 annual file. Everything here is pure: the service queries, this turns rows into
 * the file. Kept apart from `admin-exports.service.ts` so the four other F6 reports and the DAC7
 * rules each change for one reason.
 */

/** The columns of the screen, which follow the client's mockup (brief page 6). */
export const DAC7_ANNUAL_COLUMNS: AdminExportColumnDef[] = [
  { key: 'repairerName', label: 'Réparateur', type: 'text' },
  { key: 'status', label: 'Statut', type: 'text' },
  { key: 'identifier', label: 'NIF / SIREN', type: 'text' },
  { key: 'birthDate', label: 'Date de naissance', type: 'text' },
  { key: 'maskedIban', label: 'IBAN', type: 'text' },
  { key: 'transactionsCount', label: 'Nb', type: 'text' },
  { key: 'q1DisbursedEur', label: 'T1', type: 'currency' },
  { key: 'q2DisbursedEur', label: 'T2', type: 'currency' },
  { key: 'q3DisbursedEur', label: 'T3', type: 'currency' },
  { key: 'q4DisbursedEur', label: 'T4', type: 'currency' },
  { key: 'feesRetainedEur', label: 'Frais', type: 'currency' },
  { key: 'recapStatus', label: 'Récap', type: 'badge' },
];

/**
 * The columns of the FILE. The brief asks for « date et lieu de naissance, adresse » and the mockup
 * has neither a place of birth nor an address, so the screen stays as drawn and the file carries
 * what the declaration needs. The recap status is tracking for the operator, not declaration data.
 */
export const DAC7_CSV_COLUMNS: AdminExportColumnDef[] = [
  { key: 'repairerName', label: 'Réparateur', type: 'text' },
  { key: 'status', label: 'Statut', type: 'text' },
  { key: 'identifier', label: 'NIF / SIREN', type: 'text' },
  { key: 'birthDate', label: 'Date de naissance', type: 'text' },
  { key: 'birthCity', label: 'Lieu de naissance', type: 'text' },
  { key: 'birthCountry', label: 'Pays de naissance', type: 'text' },
  { key: 'address', label: 'Adresse', type: 'text' },
  { key: 'maskedIban', label: 'IBAN', type: 'text' },
  { key: 'transactionsCount', label: 'Nb', type: 'text' },
  { key: 'q1DisbursedEur', label: 'T1', type: 'currency' },
  { key: 'q2DisbursedEur', label: 'T2', type: 'currency' },
  { key: 'q3DisbursedEur', label: 'T3', type: 'currency' },
  { key: 'q4DisbursedEur', label: 'T4', type: 'currency' },
  { key: 'feesRetainedEur', label: 'Frais', type: 'currency' },
];

export type Dac7Status = 'Particulier' | 'Société' | 'Micro-entrepreneur';
export type Dac7RecapLabel = 'Envoyé' | 'Bloqué' | 'Échec' | 'En attente';

/** What the screen and the file print where a required identifier is absent. */
export const DAC7_MISSING = 'Manquant';
const NONE = '—';

export type Dac7Repairer = Prisma.UserGetPayload<{
  include: {
    profile: true;
    repairerProfile: true;
    fiscalDeclaration: true;
    businessVerification: true;
    connectAccount: true;
    dac7Recaps: true;
  };
}>;

export type Dac7Order = Pick<
  Commande,
  | 'repairerUserId'
  | 'repairCents'
  | 'transferredCents'
  | 'reversedCents'
  | 'stripeTransferReversalId'
  | 'transferredAt'
  | 'releasedAt'
>;

export type Dac7Row = {
  repairerUserId: string;
  email: string;
  repairerName: string;
  status: Dac7Status;
  identifier: string;
  birthDate: string;
  birthCity: string;
  birthCountry: string;
  address: string;
  maskedIban: string;
  transactionsCount: string;
  ordersCount: number;
  totalCents: number;
  totalDisbursedEur: string;
  q1DisbursedEur: string;
  q2DisbursedEur: string;
  q3DisbursedEur: string;
  q4DisbursedEur: string;
  feesRetainedEur: string;
  recapStatus: Dac7RecapLabel;
  isIncomplete: boolean;
};

export function formatEurCents(cents: number | null | undefined): string {
  const val = (cents ?? 0) / 100;
  return `${val.toFixed(2).replace('.', ',')} €`;
}

export function formatFrenchBirthDate(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return NONE;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return NONE;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

/**
 * What the réparateur actually kept of the order: the transfer, less what a refund clawed back.
 * `reversedCents` means something only next to a reversal id (the refund can fail after the
 * amount was planned), and a reversal with no recorded amount took the whole transfer back.
 */
export function dac7PaidCents(o: Dac7Order): number {
  const transferred = o.transferredCents ?? o.repairCents;
  if (!o.stripeTransferReversalId) return transferred;
  return transferred - (o.reversedCents ?? transferred);
}

/** The day the money moved. `transferredAt` is null only on a row older than its column. */
export function dac7PaidAt(o: Dac7Order): Date {
  return (o.transferredAt ?? o.releasedAt) as Date;
}

/**
 * Quarters are cut in UTC like every other F6 bound. The declaration is for the calendar year, and
 * whether that means UTC or Paris time is the owner's to confirm (ISS-057): an order paid between
 * 23:00 and 24:00 UTC on a quarter's last day lands in the next quarter in Paris.
 */
function quarterOf(date: Date): 0 | 1 | 2 | 3 {
  return Math.floor(date.getUTCMonth() / 3) as 0 | 1 | 2 | 3;
}

/** INSEE's « entrepreneur individuel » category (1000) and the names a verification may carry. */
function isSoleTrader(legalForm: string): boolean {
  const form = legalForm.trim().toLowerCase();
  return /micro|auto-entrepreneur|individuel/.test(form) || form === '1000' || form === 'ei';
}

function formatSiren(raw: string): string {
  const clean = raw.replace(/\s+/g, '');
  return clean.length === 9 ? `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)}` : raw.trim();
}

/** One row per réparateur, from the transfers he received in the year. */
export function buildDac7Row(repairer: Dac7Repairer, orders: Dac7Order[], year: number): Dac7Row {
  const verification = repairer.businessVerification;
  // A business verification only identifies a company once an operator approved it: a pending or
  // refused one carries a SIREN nobody checked.
  const approved = verification?.status === 'APPROVED' ? verification : null;
  const declaration = repairer.fiscalDeclaration;

  const isPro = repairer.repairerProfile?.kind === 'PRO' || approved !== null;
  const status: Dac7Status = !isPro
    ? 'Particulier'
    : verification && isSoleTrader(verification.legalForm)
      ? 'Micro-entrepreneur'
      : 'Société';
  const isCompany = status === 'Société';

  const quarters = [0, 0, 0, 0];
  let totalCents = 0;
  for (const o of orders) {
    const paid = dac7PaidCents(o);
    totalCents += paid;
    quarters[quarterOf(dac7PaidAt(o))]! += paid;
  }

  const legalPerson = [repairer.firstName, repairer.lastName].filter(Boolean).join(' ');
  const repairerName = isCompany
    ? approved?.denomination || legalPerson || repairer.name
    : legalPerson || repairer.name;

  let identifier: string;
  if (isPro) {
    identifier = approved?.siren?.trim() ? formatSiren(approved.siren) : DAC7_MISSING;
  } else if (declaration?.nif?.trim()) {
    identifier = declaration.nif.trim();
  } else if (declaration?.hasNoNif) {
    identifier = 'Sans NIF';
  } else {
    identifier = DAC7_MISSING;
  }

  const declaredAddress = declaration
    ? [declaration.addressLine, [declaration.postalCode, declaration.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : '';
  const address = (isPro ? approved?.establishmentAddress || declaredAddress : declaredAddress) || NONE;

  const birthDate = isCompany ? NONE : formatFrenchBirthDate(repairer.birthDate);
  const birthCity = isCompany ? NONE : declaration?.birthCity || NONE;
  const birthCountry = isCompany ? NONE : declaration?.birthCountry || NONE;

  // The same question the payout gate asks (CMP-D3), plus what the FILE needs that the gate does
  // not: a réparateur can be cleared to be paid and still lack a date of birth for the declaration.
  const fiscalComplete = isFiscalComplete({
    kind: repairer.repairerProfile?.kind,
    fiscalCompletedAt: repairer.repairerProfile?.fiscalCompletedAt,
    verificationLevel: repairer.profile?.verificationLevel,
    businessStatus: verification?.status,
  });
  const isIncomplete =
    !fiscalComplete ||
    identifier === DAC7_MISSING ||
    address === NONE ||
    (!isCompany && birthDate === NONE) ||
    (status === 'Particulier' && birthCity === NONE);

  const recap = repairer.dac7Recaps.find((r) => r.taxYear === year);
  const recapStatus: Dac7RecapLabel =
    recap?.status === 'SENT'
      ? 'Envoyé'
      : recap?.status === 'FAILED'
        ? 'Échec'
        : isIncomplete
          ? 'Bloqué'
          : 'En attente';

  const [q1, q2, q3, q4] = quarters as [number, number, number, number];
  return {
    repairerUserId: repairer.id,
    email: repairer.email,
    repairerName,
    status,
    identifier,
    birthDate,
    birthCity,
    birthCountry,
    address,
    maskedIban: maskIbanLast4(repairer.connectAccount?.ibanLast4) ?? NONE,
    transactionsCount: String(orders.length),
    ordersCount: orders.length,
    totalCents,
    totalDisbursedEur: formatEurCents(totalCents),
    q1DisbursedEur: formatEurCents(q1),
    q2DisbursedEur: formatEurCents(q2),
    q3DisbursedEur: formatEurCents(q3),
    q4DisbursedEur: formatEurCents(q4),
    feesRetainedEur: formatEurCents(0),
    recapStatus,
    isIncomplete,
  };
}

/** The year the declaration is about when none is asked for: the one that just ended. */
export function defaultDac7Year(now: Date = new Date()): number {
  return now.getUTCFullYear() - 1;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The annual recap a réparateur receives. His name is user-chosen text, so it is escaped in the HTML. */
export function dac7RecapMail(row: Dac7Row, year: number): { subject: string; text: string; html: string } {
  const lines: [string, string][] = [
    ['1er trimestre (T1)', row.q1DisbursedEur],
    ['2ème trimestre (T2)', row.q2DisbursedEur],
    ['3ème trimestre (T3)', row.q3DisbursedEur],
    ['4ème trimestre (T4)', row.q4DisbursedEur],
    ['Total annuel perçu', row.totalDisbursedEur],
    ["Nombre d'opérations", String(row.ordersCount)],
    ['Frais retenus', row.feesRetainedEur],
  ];
  const intro = `Conformément à la directive européenne DAC7, voici le récapitulatif annuel de vos revenus perçus sur la plateforme REVIME pour l'année fiscale ${year} :`;
  const outro = 'Ce document récapitulatif est mis à votre disposition pour votre déclaration fiscale.';

  const text = [
    `Bonjour ${row.repairerName},`,
    '',
    intro,
    '',
    ...lines.map(([label, value]) => `- ${label} : ${value}`),
    '',
    outro,
    '',
    "L'équipe REVIME",
  ].join('\n');

  const cells = lines
    .map(
      ([label, value]) =>
        `    <tr><td style="padding: 8px;">${label}</td><td style="text-align: right; padding: 8px;">${value}</td></tr>`,
    )
    .join('\n');
  const html = `<p>Bonjour ${escapeHtml(row.repairerName)},</p>
<p>${intro}</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; margin: 16px 0;">
  <thead>
    <tr style="background-color: #f3f4f6;">
      <th style="text-align: left; padding: 8px;">Période</th>
      <th style="text-align: right; padding: 8px;">Montant perçu</th>
    </tr>
  </thead>
  <tbody>
${cells}
  </tbody>
</table>
<p>${outro}</p>
<p>L'équipe REVIME</p>`;

  return { subject: `Récapitulatif annuel de vos revenus DAC7 (${year})`, text, html };
}
