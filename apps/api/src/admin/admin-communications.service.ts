import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DELETED_USER_NAME,
  RECIPIENT_SEARCH_LIMIT,
  RECIPIENT_SEARCH_MIN_CHARS,
  SERVICE_TEMPLATE_KEYS,
  normaliseRecipientQuery,
  type AdminBroadcastHistoryResponse,
  type AdminBroadcastPreview,
  type AdminBroadcastRecipientSuggestion,
  type AdminBroadcastSendInput,
  type BroadcastTarget,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { mailSender } from '../mail/mail.service.js';
import { expandAccentVariants } from '../demandes/demandes.service.js';
import { isDeletedAccount } from './deleted-account.js';

export type AdminBroadcastSendResult = {
  success: boolean;
  broadcastId: string;
  sentEmailCount: number;
  sentPushCount: number;
  totalRecipients: number;
  /** Segment members a commercial template skipped because they did not opt in. */
  skippedNoConsentCount: number;
};

/** Sends in flight at once: a 5,000-user segment must not open 5,000 mail requests together. */
const SEND_CONCURRENCY = 25;

const RECIPIENT_SELECT = {
  id: true,
  name: true,
  email: true,
  marketingConsent: true,
  marketingConsentEmail: true,
  repairerProfile: {
    select: {
      id: true,
      displayName: true,
      serviceAreaLabel: true,
      postalCode: true,
    },
  },
  pushTokens: {
    where: { disabledAt: null },
    // `platform`: V7 D1 (U6), the preview's iOS / Android split.
    select: { id: true, disabledAt: true, platform: true },
  },
} as const;

type Recipient = {
  id: string;
  name: string | null;
  email: string | null;
  marketingConsent: boolean;
  marketingConsentEmail: boolean;
  repairerProfile: {
    id: string;
    displayName?: string | null;
    serviceAreaLabel?: string | null;
    postalCode?: string | null;
  } | null;
  pushTokens: Array<{ id: string; disabledAt: Date | null; platform?: 'IOS' | 'ANDROID' }>;
};

const SUGGESTION_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  banned: true,
  repairerProfile: { select: { id: true } },
} as const;

type SuggestionRow = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  banned: boolean | null;
  repairerProfile: { id: string } | null;
};

const toSuggestion = (u: SuggestionRow): AdminBroadcastRecipientSuggestion => ({
  id: u.id,
  username: u.username,
  name: u.name,
  email: u.email,
  role: u.repairerProfile ? 'REPAIRER' : 'CLIENT',
  suspended: Boolean(u.banned),
});

/** A tombstone is no one to write to (V7 D2, Q4); a suspended account still is. */
const NOT_DELETED = { profile: { deletedAt: null } } as const;

const hasEmail = (u: Recipient): boolean => Boolean(u.email && u.email.trim().length > 0);
const hasPush = (u: Recipient): boolean => u.pushTokens.some((t) => !t.disabledAt);
const hasPushOn = (u: Recipient, platform: 'IOS' | 'ANDROID'): boolean =>
  u.pushTokens.some((t) => !t.disabledAt && t.platform === platform);
const roleOf = (u: Recipient): 'REPAIRER' | 'CLIENT' => (u.repairerProfile ? 'REPAIRER' : 'CLIENT');
/** A client has no stored location; only a réparateur's service area is known. */
const cityOf = (u: Recipient): string | null => u.repairerProfile?.serviceAreaLabel ?? null;

/** Runs `fn` over `items`, `size` at a time, and returns every settled result in order. */
async function settledInChunks<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.allSettled(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * Whether a broadcast needs the recipients' marketing opt-in. A maintenance notice and a
 * reminder to finish a verification are service messages; announcements, opportunities and
 * custom text are commercial. A one-to-one message to a named user is not a campaign.
 */
export function needsMarketingConsent(input: Pick<AdminBroadcastSendInput, 'target' | 'templateKey'>): boolean {
  return (
    input.target.type === 'SEGMENT' &&
    !(SERVICE_TEMPLATE_KEYS as readonly string[]).includes(input.templateKey)
  );
}

@Injectable()
export class AdminCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private async resolveRecipients(target: BroadcastTarget): Promise<Recipient[]> {
    if (target.type === 'INDIVIDUAL') {
      const user = await this.prisma.user.findUnique({
        where: { id: target.userId },
        select: RECIPIENT_SELECT,
      });
      return user ? [user] : [];
    }
    return this.prisma.user.findMany({
      where: this.buildSegmentWhere(target),
      select: RECIPIENT_SELECT,
    });
  }

  async previewAudience(target: BroadcastTarget): Promise<AdminBroadcastPreview> {
    const users = await this.resolveRecipients(target);
    return {
      totalRecipients: users.length,
      emailEligibleCount: users.filter(hasEmail).length,
      pushEligibleCount: users.filter(hasPush).length,
      marketingEmailCount: users.filter((u) => hasEmail(u) && u.marketingConsentEmail).length,
      marketingPushCount: users.filter((u) => hasPush(u) && u.marketingConsent).length,
      // V7 D1 (U6): who is reachable on each platform, so a zero says where it comes from (the
      // client's 2026-10-27 broadcasts: iOS holders without consent, and no Android token at all).
      pushIosCount: users.filter((u) => hasPushOn(u, 'IOS')).length,
      pushAndroidCount: users.filter((u) => hasPushOn(u, 'ANDROID')).length,
      marketingPushIosCount: users.filter((u) => hasPushOn(u, 'IOS') && u.marketingConsent).length,
      marketingPushAndroidCount: users.filter((u) => hasPushOn(u, 'ANDROID') && u.marketingConsent).length,
      sampleRecipients: users.slice(0, 10).map((u) => ({
        id: u.id,
        name: u.name || 'Utilisateur',
        email: u.email ?? '',
        city: cityOf(u),
        role: roleOf(u),
      })),
    };
  }

  /**
   * V7 D2 (U5, `DEC7-20`): the single-recipient suggestions. Matches the pseudo, the name and
   * e-mail with the global search's accent variants, the phone and the id prefix, so a pasted id
   * still finds its user. An exact pseudo or e-mail match comes first, then the newest accounts,
   * because « nes » must not lose to eight newer « nes… » handles.
   */
  async searchRecipients(q: string | undefined): Promise<AdminBroadcastRecipientSuggestion[]> {
    const term = normaliseRecipientQuery(q);
    if (term.length < RECIPIENT_SEARCH_MIN_CHARS) return [];

    const lower = term.toLowerCase();
    const [exact, rows] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          AND: [
            NOT_DELETED,
            { OR: [{ username: lower }, { email: { equals: term, mode: 'insensitive' } }] },
          ],
        },
        select: SUGGESTION_SELECT,
      }),
      this.prisma.user.findMany({
        where: {
          AND: [
            NOT_DELETED,
            {
              OR: [
                { id: { startsWith: term } },
                { username: { contains: lower, mode: 'insensitive' } },
                ...expandAccentVariants(term, 16).flatMap((v) => [
                  { name: { contains: v, mode: 'insensitive' as const } },
                  { email: { contains: v, mode: 'insensitive' as const } },
                ]),
                { phone: { contains: term } },
              ],
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: RECIPIENT_SEARCH_LIMIT,
        select: SUGGESTION_SELECT,
      }),
    ]);

    const ordered = exact ? [exact, ...rows.filter((u) => u.id !== exact.id)] : rows;
    return ordered.slice(0, RECIPIENT_SEARCH_LIMIT).map((u) => toSuggestion(u as SuggestionRow));
  }

  async getHistory(page = 1, limit = 20): Promise<AdminBroadcastHistoryResponse> {
    const p = Math.max(1, Math.trunc(Number(page)) || 1);
    const l = Math.max(1, Math.min(100, Math.trunc(Number(limit)) || 20));
    const skip = (p - 1) * l;

    const [rows, total] = await Promise.all([
      this.prisma.adminBroadcast.findMany({
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: {
          operator: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.adminBroadcast.count(),
    ]);

    // V7 D2 (Q6): the pseudo is read now, not stored at send time, so a renamed user reads
    // under today's pseudo and the sends made before U5 are named too.
    const recipientIds = [
      ...new Set(
        rows
          .filter((b: any) => b.targetType === 'INDIVIDUAL' && typeof b.targetFilter?.userId === 'string')
          .map((b: any) => b.targetFilter.userId as string),
      ),
    ];
    const recipients = new Map<string, string>();
    if (recipientIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, username: true, name: true, profile: { select: { deletedAt: true } } },
      });
      for (const u of users) {
        recipients.set(u.id, isDeletedAccount(u) ? DELETED_USER_NAME : `@${u.username}`);
      }
    }

    const items = rows.map((b: any) => ({
      id: b.id,
      subject: b.subject,
      channelEmail: Boolean(b.channelEmail),
      channelPush: Boolean(b.channelPush),
      targetType: b.targetType as 'INDIVIDUAL' | 'SEGMENT',
      targetSummary: this.formatTargetSummary(b.targetType, b.targetFilter, recipients),
      totalRecipients: b.totalRecipients ?? 0,
      sentEmailCount: b.sentEmailCount ?? 0,
      sentPushCount: b.sentPushCount ?? 0,
      operatorName: b.operator?.name ?? 'Admin',
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
    }));

    return {
      items,
      total,
    };
  }

  /** `recipients`: user id → « @pseudo », or « Utilisateur supprimé »; an id absent from it is gone. */
  formatTargetSummary(targetType: string, filter: any, recipients: ReadonlyMap<string, string> = new Map()): string {
    if (targetType === 'INDIVIDUAL') {
      const id = typeof filter === 'object' && filter?.userId ? filter.userId : '';
      return `Destinataire unique · ${recipients.get(id) ?? DELETED_USER_NAME}`;
    }

    const parts: string[] = [];
    const role = typeof filter === 'object' ? filter?.role : undefined;
    if (role === 'REPAIRER') {
      parts.push('Réparateurs');
    } else if (role === 'CLIENT') {
      parts.push('Clients');
    } else {
      parts.push('Tous les utilisateurs');
    }

    if (typeof filter === 'object' && filter) {
      if (filter.city) {
        parts.push(String(filter.city).trim());
      }
      if (filter.department) {
        parts.push(`Dép. ${String(filter.department).trim()}`);
      }
      if (filter.verifiedOnly) {
        parts.push('Vérifiés uniquement');
      }
    }

    return parts.join(' · ');
  }

  private buildSegmentWhere(target: Extract<BroadcastTarget, { type: 'SEGMENT' }>) {
    const and: Record<string, unknown>[] = [];

    if (target.activeOnly !== false) {
      and.push({
        OR: [{ banned: false }, { banned: null }],
      });
    }

    if (target.verifiedOnly) {
      and.push({
        OR: [
          { emailVerified: true },
          { profile: { verificationLevel: { in: ['BASIC', 'IDENTITY', 'BUSINESS'] } } },
        ],
      });
    }

    if (target.role === 'CLIENT') {
      and.push({
        repairerProfile: null,
      });
    } else if (target.role === 'REPAIRER') {
      and.push({
        repairerProfile: { isNot: null },
      });
    }

    if (target.city && target.city.trim()) {
      const c = target.city.trim();
      and.push({
        repairerProfile: {
          OR: [
            { serviceAreaLabel: { contains: c, mode: 'insensitive' } },
            { postalCode: { startsWith: c } },
          ],
        },
      });
    }

    if (target.department && target.department.trim()) {
      const d = target.department.trim();
      and.push({
        repairerProfile: {
          postalCode: { startsWith: d },
        },
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  interpolateVariables(
    text: string,
    user: { name?: string | null; city?: string | null; role?: string }
  ): string {
    const firstName = user.name?.split(' ')[0] || (user.role === 'REPAIRER' ? 'réparateur' : 'client');
    const lastName = user.name?.split(' ').slice(1).join(' ') || '';
    const city = user.city || 'votre secteur';
    return text
      .replace(/\{\{prenom\}\}/gi, firstName)
      .replace(/\{\{nom\}\}/gi, lastName)
      .replace(/\{\{ville\}\}/gi, city);
  }

  /**
   * The audit row is written by `AdminAuditInterceptor` (`@Audit('broadcast.send')` on the
   * controller), not here: this method used to build the row by hand through a duck-typed
   * `adminAuditLog || adminAudit` and swallow its failure.
   */
  async sendBroadcast(
    operatorId: string,
    input: AdminBroadcastSendInput,
  ): Promise<AdminBroadcastSendResult> {
    const recipients = await this.resolveRecipients(input.target);
    if (input.target.type === 'INDIVIDUAL' && recipients.length === 0) {
      throw new NotFoundException('Destinataire introuvable.');
    }

    const commercial = needsMarketingConsent(input);
    const personalise = (u: Recipient) => {
      const vars = { name: u.name, city: cityOf(u), role: roleOf(u) };
      return {
        subject: this.interpolateVariables(input.subject, vars),
        body: this.interpolateVariables(input.body, vars),
      };
    };

    let sentEmailCount = 0;
    const skipped = new Set<string>();
    if (input.channels.email) {
      const eligible = recipients.filter(hasEmail);
      const emailRecipients = commercial ? eligible.filter((u) => u.marketingConsentEmail) : eligible;
      for (const u of eligible) if (!emailRecipients.includes(u)) skipped.add(u.id);
      const results = await settledInChunks(emailRecipients, SEND_CONCURRENCY, async (u) => {
        const { subject, body } = personalise(u);
        try {
          await mailSender().send({ to: u.email!, subject, text: body });
        } catch (err) {
          console.error(`[AdminCommunicationsService] Failed to send email to ${u.email}:`, err);
          throw err;
        }
      });
      sentEmailCount = results.filter((r) => r.status === 'fulfilled').length;
    }

    let sentPushCount = 0;
    if (input.channels.push) {
      const eligible = recipients.filter(hasPush);
      const pushRecipients = commercial ? eligible.filter((u) => u.marketingConsent) : eligible;
      for (const u of eligible) if (!pushRecipients.includes(u)) skipped.add(u.id);
      const results = await settledInChunks(pushRecipients, SEND_CONCURRENCY, async (u) => {
        const { subject, body } = personalise(u);
        // `pushMessageFor` has no free-text type: MESSAGE_RECEIVED renders « Message de Revime »
        // and the preview cut at 120 characters. The subject goes FIRST so the operator's
        // headline is what the lock screen shows. A dedicated type is an EAS-build decision.
        return this.push.dispatch({
          userId: u.id,
          mode: roleOf(u),
          type: 'MESSAGE_RECEIVED',
          actorName: 'Revime',
          subject: null,
          amountCents: null,
          step: null,
          messagePreview: `${subject} : ${body}`,
          notificationId: null,
          demandeId: null,
          commandeId: null,
          conversationId: null,
        });
      });
      // `dispatch` resolves to the number of tickets Expo accepted: 0 for a user whose token
      // was refused, so a delivery failure is no longer counted as « sent ».
      sentPushCount = results.filter((r) => r.status === 'fulfilled' && r.value > 0).length;
    }

    const broadcast = await this.prisma.adminBroadcast.create({
      data: {
        operatorId,
        channelEmail: input.channels.email,
        channelPush: input.channels.push,
        targetType: input.target.type,
        targetFilter: input.target,
        templateKey: input.templateKey,
        subject: input.subject,
        body: input.body,
        totalRecipients: recipients.length,
        sentEmailCount,
        sentPushCount,
      },
    });

    return {
      success: true,
      broadcastId: broadcast.id,
      sentEmailCount,
      sentPushCount,
      totalRecipients: recipients.length,
      skippedNoConsentCount: skipped.size,
    };
  }
}
