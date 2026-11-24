import { z } from 'zod';
import type { CommandeStatus } from './commande.schemas.js';
import { MESSAGE_BODY_MAX } from './conversation.schemas.js';

export const disputeMotifSchema = z.enum([
  'REPAIR_NON_CONFORMING',
  'ITEM_DAMAGED',
  'REPAIR_INCOMPLETE',
  'DEADLINE_MISSED',
  'CLIENT_UNREACHABLE',
  'ITEM_NOT_AS_DESCRIBED',
  'ITEM_NOT_HANDED_OVER',
  'SERVICE_DISAGREEMENT',
  'OTHER',
]);
export type DisputeMotif = z.infer<typeof disputeMotifSchema>;

export type DisputeSide = 'CLIENT' | 'REPAIRER';

export const DISPUTE_MOTIFS: Record<
  DisputeMotif,
  { label: string; subtitle: string | null; sides: readonly DisputeSide[] }
> = {
  REPAIR_NON_CONFORMING: {
    label: 'Réparation non conforme',
    subtitle: "Le problème n'a pas été correctement résolu",
    sides: ['CLIENT'],
  },
  ITEM_DAMAGED: {
    label: 'Objet endommagé',
    subtitle: "L'objet est plus abîmé qu'avant",
    sides: ['CLIENT'],
  },
  REPAIR_INCOMPLETE: {
    label: 'Réparation incomplète',
    subtitle: "Tout n'a pas été réparé",
    sides: ['CLIENT'],
  },
  DEADLINE_MISSED: {
    label: 'Non respect du délai',
    subtitle: "Le délai annoncé n'a pas été respecté",
    sides: ['CLIENT'],
  },
  CLIENT_UNREACHABLE: {
    label: 'Client injoignable',
    subtitle: 'Le client ne répond plus',
    sides: ['REPAIRER'],
  },
  ITEM_NOT_AS_DESCRIBED: {
    label: 'Objet non conforme à la description',
    subtitle: "L'objet reçu ne correspond pas à la demande",
    sides: ['REPAIRER'],
  },
  ITEM_NOT_HANDED_OVER: {
    label: 'Objet non envoyé / non remis',
    subtitle: "L'objet ne m'a pas été envoyé ou remis",
    sides: ['REPAIRER'],
  },
  SERVICE_DISAGREEMENT: {
    label: 'Désaccord sur la prestation',
    subtitle: 'Désaccord avec le client sur la réparation',
    sides: ['REPAIRER'],
  },
  OTHER: {
    label: 'Autre motif',
    subtitle: null,
    sides: ['CLIENT', 'REPAIRER'],
  },
};

export function motifsFor(side: DisputeSide): DisputeMotif[] {
  return disputeMotifSchema.options.filter((motif) =>
    DISPUTE_MOTIFS[motif].sides.includes(side),
  );
}

export function formatDisputeRef(n: number): string {
  return `#LIT-${String(n).padStart(4, '0')}`;
}

export const disputeAttachmentInputSchema = z.object({
  kind: z.enum(['photo', 'document']),
  path: z.string().min(1),
  name: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type DisputeAttachmentInput = z.infer<typeof disputeAttachmentInputSchema>;

export const openDisputeByPartySchema = z.object({
  motif: disputeMotifSchema,
  description: z
    .string()
    .trim()
    .min(20, { message: 'Décrivez le problème en 20 caractères minimum.' })
    .max(1000, { message: '1000 caractères maximum.' }),
  attachments: z
    .array(disputeAttachmentInputSchema)
    .max(5, { message: 'Cinq pièces jointes au maximum.' })
    .default([]),
});
export type OpenDisputeByPartyInput = z.infer<typeof openDisputeByPartySchema>;

export const sendDisputeMessageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(MESSAGE_BODY_MAX, { message: 'Message trop long.' })
      .default(''),
    attachment: disputeAttachmentInputSchema.optional(),
  })
  .refine((data) => data.body.length > 0 || Boolean(data.attachment), {
    message: 'Votre message est vide.',
    path: ['body'],
  });
export type SendDisputeMessageInput = z.infer<typeof sendDisputeMessageSchema>;

export const signAttachmentSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'application/pdf'], {
    message: 'Seuls les formats JPEG, PNG et PDF sont acceptés.',
  }),
});
export type SignAttachmentInput = z.infer<typeof signAttachmentSchema>;

export type DocumentDto = {
  url: string;
  name: string;
  sizeBytes: number | null;
};

export type DisputeMessageDto = {
  id: string;
  author: 'me' | 'revime';
  body: string;
  photoUrl: string | null;
  document: DocumentDto | null;
  createdAt: string;
};

export const disputeStatusSchema = z.enum([
  'OPEN',
  'IN_REVIEW',
  'RESOLVED_REFUNDED',
  'RESOLVED_RELEASED',
  'RESOLVED_DISMISSED',
]);
export type DisputeStatusType = z.infer<typeof disputeStatusSchema>;

export type PartyDisputeDto = {
  number: number;
  reference: string;
  status: DisputeStatusType;
  motifLabel: string | null;
  openedAt: string;
  openedBySide: 'CLIENT' | 'REPAIRER' | 'REVIME';
  canWrite: boolean;
  messages: DisputeMessageDto[];
};

export function disputePolicy(input: {
  status: CommandeStatus;
  releasedAt: string | null;
  dispute: { status: DisputeStatusType } | null | undefined;
}): { canOpen: boolean } {
  const canOpen =
    input.status === 'PAID' &&
    input.releasedAt === null &&
    input.dispute == null;
  return { canOpen };
}

export const SUPPORT_PREFIX = 'REVIME — Support : ';

export function stripSupportPrefix(body: string): string {
  if (body.startsWith(SUPPORT_PREFIX)) {
    return body.slice(SUPPORT_PREFIX.length);
  }
  return body;
}

/**
 * `CF4-28` (spec §4.7). Subtitle for the 'Litige ouvert' timeline entry.
 */
export function disputeTimelineSub(
  openedBySide: 'CLIENT' | 'REPAIRER' | 'REVIME',
  viewerRole: 'client' | 'repairer' | 'CLIENT' | 'REPAIRER',
): string {
  if (openedBySide === 'REVIME') {
    return 'Litige transmis à REVIME';
  }
  const roleUpper = viewerRole.toUpperCase();
  if (openedBySide === roleUpper) {
    return 'Votre signalement a été transmis à REVIME';
  }
  if (openedBySide === 'CLIENT') {
    return 'Le client a signalé un problème';
  }
  return 'Le réparateur a signalé un problème';
}
