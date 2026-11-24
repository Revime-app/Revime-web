import { z } from 'zod';
import {
  canAdvance,
  type CommandeStep,
  type DeliveryMode,
} from './commande.schemas.js';
import { euros } from './compare-criteria.js';

/**
 * CF4 sub-project G - the réparateur Tableau de bord's « À faire » and « Activité récente »
 * (spec `docs/superpowers/specs/2026-09-30-cf4-g-repairer-dashboard-design.md` §4.1, §4.2).
 *
 * The server sends FACTS (kinds, counts, dates); every French string is built here, so
 * sub-project J can reword a line without an API change and the copy is unit-tested
 * (`apps/mobile` has no harness).
 */

const countSchema = z.number().int().positive();

export const dashboardTodoItemSchema = z.discriminatedUnion('kind', [
  // commandeId only when count === 1, so the row can open that commande directly.
  // CF4-22: `awaitingReply` = how many of those disputes have REVIME as the last author in
  // HIS confidential space (REVIME asked, he has not answered). When > 0, `commandeId` points
  // at the single awaiting one (or null when several). Optional: a server older than the app
  // sends it `undefined`, read as 0.
  z.object({
    kind: z.literal('DISPUTE'),
    count: countSchema,
    commandeId: z.string().nullable(),
    awaitingReply: z.number().int().nonnegative().optional(),
  }),
  z.object({ kind: z.literal('ATTENTION'), count: countSchema, commandeId: z.string().nullable() }),
  z.object({ kind: z.literal('MATCHING'), count: countSchema }),
  // Replaces MATCHING when he has declared no category (G1).
  z.object({ kind: z.literal('CATEGORIES_MISSING') }),
  // CF4-25. Open private quote requests addressed to him.
  z.object({ kind: z.literal('QUOTE_REQUESTS'), count: countSchema }),
]);
export type DashboardTodoItem = z.infer<typeof dashboardTodoItemSchema>;

/** Also the tie order when two events share a timestamp. */
export const DASHBOARD_ACTIVITY_KINDS = [
  'OFFER_ACCEPTED',
  'REPAIR_DONE',
  'FUNDS_RELEASED',
  'REVIEW_RECEIVED',
  'DISPUTE_OPENED',
] as const;
export const dashboardActivityKindSchema = z.enum(DASHBOARD_ACTIVITY_KINDS);
export type DashboardActivityKind = z.infer<typeof dashboardActivityKindSchema>;

export const dashboardActivityItemSchema = z.object({
  kind: dashboardActivityKindSchema,
  /** ISO timestamp. */
  at: z.string(),
  commandeId: z.string(),
  /** The demande title, read at request time. */
  subject: z.string(),
  /** FUNDS_RELEASED only. */
  amountCents: z.number().int().nullable(),
  /** REVIEW_RECEIVED only. */
  rating: z.number().int().nullable(),
});
export type DashboardActivityItem = z.infer<typeof dashboardActivityItemSchema>;

export const repairerDashboardSchema = z.object({
  /** Empty = « Tout est à jour ». Fixed order: DISPUTE, ATTENTION, QUOTE_REQUESTS, MATCHING | CATEGORIES_MISSING. */
  todo: z.array(dashboardTodoItemSchema),
  /** At most 5, newest first. */
  activity: z.array(dashboardActivityItemSchema),
  /** CF5-15: When the réparateur last inspected the dashboard. Null if never. */
  todoSeenAt: z.string().nullable().optional(),
  /** CF5-15: Number of « À faire » actions created/updated since todoSeenAt. */
  unseenTodoCount: z.number().int().nonnegative().optional(),
});
export type RepairerDashboardDto = z.infer<typeof repairerDashboardSchema>;

/**
 * True when the next step of this commande is one the RÉPARATEUR claims - « nécessite
 * votre attention » (G4). It IS `canAdvance(…, 'REPAIRER')`, delegated rather than
 * re-derived: the step button on the commande screen calls `canAdvance`, and two
 * implementations of "what comes next" is how a line names an action the screen then does
 * not offer (`commande.schemas.ts` records the same reasoning for the server guard).
 */
export function isRepairerTurn(step: CommandeStep, delivery: DeliveryMode): boolean {
  return canAdvance(step, delivery, 'REPAIRER');
}

/**
 * Newest first; same-timestamp ties by `DASHBOARD_ACTIVITY_KINDS` order, then `commandeId`
 * ascending, so the order is stable across refetches whatever order the sources came in.
 */
export function mergeActivity(
  items: readonly DashboardActivityItem[],
  limit = 5,
): DashboardActivityItem[] {
  const kindIndex = (k: DashboardActivityKind) => DASHBOARD_ACTIVITY_KINDS.indexOf(k);
  return [...items]
    .sort((a, b) => {
      const t = Date.parse(b.at) - Date.parse(a.at);
      if (t !== 0) return t;
      const k = kindIndex(a.kind) - kindIndex(b.kind);
      if (k !== 0) return k;
      return a.commandeId < b.commandeId ? -1 : a.commandeId > b.commandeId ? 1 : 0;
    })
    .slice(0, limit);
}

export type TodoCopy = { title: string; body: string; cta: string };

/** Spec §4.2, verbatim. Straight apostrophes, as in the rest of the shared copy. */
export function todoCopy(item: DashboardTodoItem): TodoCopy {
  switch (item.kind) {
    case 'DISPUTE': {
      // CF4-22, the client's V4 §6 wording, once REVIME is waiting on him.
      const awaiting = item.awaitingReply ?? 0;
      if (awaiting > 0) {
        return {
          title:
            awaiting === 1
              ? '1 litige nécessite votre réponse'
              : `${awaiting} litiges nécessitent votre réponse`,
          body: 'REVIME attend des informations de votre part.',
          cta: 'Répondre →',
        };
      }
      return {
        title:
          item.count === 1
            ? '1 litige est en cours sur une de vos réparations'
            : `${item.count} litiges sont en cours sur vos réparations`,
        body: 'REVIME examine la situation.',
        cta: 'Voir →',
      };
    }
    case 'ATTENTION':
      return item.count === 1
        ? {
            title: '1 réparation nécessite votre attention',
            body: 'Une étape est à valider de votre côté.',
            cta: 'Voir →',
          }
        : {
            title: `${item.count} réparations nécessitent votre attention`,
            body: 'Des étapes sont à valider de votre côté.',
            cta: 'Voir →',
          };
    case 'MATCHING':
      return {
        title:
          item.count === 1
            ? '1 nouvelle demande correspond à vos services'
            : `${item.count} nouvelles demandes correspondent à vos services`,
        body: "Vous n'avez pas encore fait d'offre.",
        cta: 'Voir les demandes →',
      };
    case 'CATEGORIES_MISSING':
      return {
        title: 'Indiquez les catégories que vous réparez',
        body: 'Pour voir les demandes qui vous correspondent.',
        cta: 'Mes catégories →',
      };
    case 'QUOTE_REQUESTS':
      return {
        title:
          item.count === 1
            ? '1 demande de devis en attente de réponse'
            : `${item.count} demandes de devis en attente de réponse`,
        body: 'Envoyez un devis ou refusez la demande.',
        cta: 'Voir →',
      };
  }
}

/** The empty « À faire » state. The ✓ is drawn by the screen as an icon, never a glyph. */
export const TODO_EMPTY_COPY = {
  title: 'Tout est à jour',
  body: "Aucune action n'est requise pour le moment.",
} as const;

export function activityCopy(item: DashboardActivityItem): string {
  switch (item.kind) {
    case 'OFFER_ACCEPTED':
      return 'Offre acceptée';
    case 'REPAIR_DONE':
      return 'Réparation terminée';
    case 'FUNDS_RELEASED':
      return item.amountCents === null
        ? 'Fonds versés'
        : `Fonds versés · ${euros(item.amountCents)}`;
    case 'REVIEW_RECEIVED':
      return item.rating === null ? 'Nouvel avis' : `Nouvel avis · ${item.rating}/5`;
    case 'DISPUTE_OPENED':
      return 'Litige ouvert';
  }
}

/** The Accueil card's count pill: sum of counts, CATEGORIES_MISSING counting 1. */
export function todoBadgeCount(todo: readonly DashboardTodoItem[]): number {
  return todo.reduce((sum, t) => sum + (t.kind === 'CATEGORIES_MISSING' ? 1 : t.count), 0);
}
