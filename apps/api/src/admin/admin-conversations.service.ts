import { Injectable } from '@nestjs/common';
import {
  adminConversationListQuerySchema,
  ADMIN_ROLES,
  isStaffRole,
  type AdminConversationDetailResponse,
  type AdminConversationKpis,
  type AdminConversationListQuery,
  type AdminConversationListResponse,
  type AdminConversationSummaryItem,
} from '@revime/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GENUINE_USER_WHERE } from './admin-constants.js';
import { storageGateway } from '../storage/gateway.js';
import { PHOTO_BUCKET } from '../storage/photo-paths.js';
import { attachmentBucket, signAttachmentUrls } from '../storage/attachment-paths.js';

/** A conversation between two real accounts (neither a fixture nor a demo account). */
const GENUINE_PARTICIPANTS_WHERE = {
  client: GENUINE_USER_WHERE,
  repairer: GENUINE_USER_WHERE,
} satisfies Prisma.ConversationWhereInput;

type ConversationSummaryRow = {
  id: string;
  demandeId: string | null;
  clientUserId: string;
  repairerUserId: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  demande: {
    id: string;
    title: string;
    status: string;
    commandes: Array<{
      dispute: { id: string } | null;
    }>;
  } | null;
  client: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  repairer: {
    id: string;
    name: string;
    email: string;
    repairerProfile: {
      displayName?: string | null;
      companyName?: string | null;
    } | null;
  };
  reports: Array<{ id: string }>;
  messages: Array<{
    id: string;
    body: string;
    createdAt: Date;
    kind: string;
    sender: { name: string } | null;
  }>;
  _count: {
    messages: number;
  };
};

type ConversationDetailRow = {
  id: string;
  clientUserId: string;
  repairerUserId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  demande: {
    id: string;
    title: string;
    status: string;
    budgetCents: number | null;
    category: { labelFr: string } | null;
    commandes: Array<{
      id: string;
      status: string;
      totalCents: number;
      dispute: { id: string } | null;
    }>;
  } | null;
  client: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    createdAt: Date;
    profile: { avatarPath: string | null } | null;
  };
  repairer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    profile?: { avatarPath: string | null; verificationLevel?: string | null } | null;
    repairerProfile: { displayName?: string | null } | null;
  };
  reports: Array<{ id: string }>;
  messages: Array<{
    id: string;
    senderUserId: string | null;
    kind: string;
    body: string;
    photoPath: string | null;
    documentPath: string | null;
    documentName: string | null;
    createdAt: Date;
    deletedAt: Date | null;
    sender: { id: string; name: string; role: string | null } | null;
  }>;
};

@Injectable()
export class AdminConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queries and paginates conversations across the platform based on multi-criteria filters:
   * text search `q`, status (`open`, `closed`, `all`), disputes, reports, and date boundaries.
   * Concurrently calculates operational KPIs (`activeCount`, `closedCount`, etc.).
   */
  async listConversations(query: AdminConversationListQuery): Promise<AdminConversationListResponse> {
    const parsed = adminConversationListQuerySchema.parse(query ?? {});
    const { q, status, hasDispute, hasReport, startDate, endDate, page, limit } = parsed;

    const and: Prisma.ConversationWhereInput[] = [];

    // 0. Real accounts only, like every figure on the other admin pages (RU-31): a fixture or demo
    // conversation is neither listed nor counted.
    and.push(GENUINE_PARTICIPANTS_WHERE);

    // 1. Text search `q`, accent-insensitive in SQL (ISS-075)
    const term = q.trim();
    if (term.length > 0) {
      and.push({ id: { in: await this.searchConversationIds(term) } });
    }

    // 2. Status filter
    if (status === 'open') {
      and.push({ deletedAt: null });
    } else if (status === 'closed') {
      and.push({ deletedAt: { not: null } });
    }

    // 3. Dispute filter
    if (hasDispute === 'true') {
      and.push({ demande: { commandes: { some: { dispute: { isNot: null } } } } });
    } else if (hasDispute === 'false') {
      and.push({ NOT: { demande: { commandes: { some: { dispute: { isNot: null } } } } } });
    }

    // 4. Report filter
    if (hasReport === 'true') {
      and.push({ reports: { some: {} } });
    } else if (hasReport === 'false') {
      and.push({ reports: { none: {} } });
    }

    // 5. Date filter on createdAt
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!Number.isNaN(start.getTime())) {
        dateFilter.gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!Number.isNaN(end.getTime())) {
        dateFilter.lte = end;
      }
    }
    if (dateFilter.gte !== undefined || dateFilter.lte !== undefined) {
      and.push({ createdAt: dateFilter });
    }

    const where: Prisma.ConversationWhereInput = { AND: and };

    // 6. Parallel query execution & KPI counts
    const [total, kpis, rawRows] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.getConversationKpis(),
        this.prisma.conversation.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
          include: {
            demande: {
              select: {
                id: true,
                title: true,
                status: true,
                commandes: {
                  select: {
                    dispute: {
                      select: { id: true },
                    },
                  },
                },
              },
            },
            client: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
            repairer: {
              select: {
                id: true,
                name: true,
                email: true,
                repairerProfile: {
                  select: { displayName: true },
                },
              },
            },
            reports: {
              select: { id: true },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                body: true,
                createdAt: true,
                kind: true,
                sender: {
                  select: { name: true },
                },
              },
            },
            _count: {
              select: { messages: true },
            },
          },
        }),
      ]);

    const rows = rawRows as unknown as ConversationSummaryRow[];

    // 7. Map each row to summary item
    const items: AdminConversationSummaryItem[] = rows.map((row) => {
      const lastMsg = row.messages[0];
      const hasDisputeBool = Boolean(row.demande?.commandes?.some((c: any) => Boolean(c.dispute)));
      const disputeId = row.demande?.commandes?.find((c: any) => Boolean(c.dispute))?.dispute?.id ?? null;

      const compName = row.repairer.repairerProfile?.displayName ?? null;

      return {
        id: row.id,
        demande: row.demande
          ? {
              id: row.demande.id,
              title: row.demande.title,
              status: row.demande.status,
            }
          : null,
        client: {
          id: row.client.id,
          name: row.client.name,
          email: row.client.email,
          phone: row.client.phone ?? null,
        },
        repairer: {
          id: row.repairer.id,
          name: row.repairer.name,
          email: row.repairer.email,
          companyName: compName,
        },
        messagesCount: row._count.messages,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              body: lastMsg.body,
              senderName: lastMsg.sender?.name || 'Revime',
              createdAt: lastMsg.createdAt.toISOString(),
              isSystem: lastMsg.kind === 'SYSTEM',
            }
          : null,
        lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
        closed: row.deletedAt !== null,
        hasDispute: hasDisputeBool,
        hasReport: (row.reports?.length ?? 0) > 0,
        disputeId,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return {
      total,
      items,
      page,
      limit,
      kpis,
    };
  }

  /**
   * Retrieves full chronological thread detail for administrative inspection:
   * client, repairer, demande/commande links, message bubbles with role attribution,
   * soft-deleted markers, and signed media URLs.
   */
  async getConversationDetail(id: string): Promise<AdminConversationDetailResponse> {
    const row = (await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        clientUserId: true,
        repairerUserId: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
            profile: { select: { avatarPath: true } },
          },
        },
        repairer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            profile: { select: { avatarPath: true, verificationLevel: true } },
            repairerProfile: { select: { displayName: true } },
          },
        },
        demande: {
          select: {
            id: true,
            title: true,
            status: true,
            budgetCents: true,
            category: { select: { labelFr: true } },
            commandes: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                totalCents: true,
                dispute: { select: { id: true } },
              },
            },
          },
        },
        reports: { select: { id: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            senderUserId: true,
            kind: true,
            body: true,
            photoPath: true,
            documentPath: true,
            documentName: true,
            createdAt: true,
            deletedAt: true,
            sender: { select: { id: true, name: true, role: true } },
          },
        },
      },
    })) as unknown as ConversationDetailRow | null;

    if (!row) {
      throw new AppException('NOT_FOUND', 'Conversation introuvable.');
    }

    // Collect media paths to sign
    const photoPaths: string[] = [];
    const documentPaths: string[] = [];

    const clientAvatarPath = row.client.profile?.avatarPath;
    if (clientAvatarPath) {
      photoPaths.push(clientAvatarPath);
    }
    const repairerAvatarPath = row.repairer.profile?.avatarPath;
    if (repairerAvatarPath) {
      photoPaths.push(repairerAvatarPath);
    }
    for (const m of row.messages) {
      if (m.photoPath) photoPaths.push(m.photoPath);
      if (m.documentPath) documentPaths.push(m.documentPath);
    }

    const signedUrls = await this.signMediaUrls(photoPaths, documentPaths);

    // Map messages with explicit role attribution & moderation status
    const messages = row.messages.map((msg) => {
      let senderRole: 'CLIENT' | 'REPAIRER' | 'SYSTEM' | 'ADMIN';
      if (msg.kind === 'SYSTEM' || !msg.senderUserId) {
        senderRole = 'SYSTEM';
      } else if (
        msg.sender?.role &&
        (isStaffRole(msg.sender.role) ||
          msg.sender.role.toLowerCase() === 'admin' ||
          (ADMIN_ROLES as readonly string[]).includes(msg.sender.role))
      ) {
        senderRole = 'ADMIN';
      } else if (msg.senderUserId === row.clientUserId) {
        senderRole = 'CLIENT';
      } else if (msg.senderUserId === row.repairerUserId) {
        senderRole = 'REPAIRER';
      } else {
        senderRole = 'CLIENT';
      }

      const senderName =
        senderRole === 'SYSTEM'
          ? 'Revime'
          : msg.sender?.name || (senderRole === 'CLIENT' ? row.client.name : row.repairer.name);

      return {
        id: msg.id,
        senderId: msg.senderUserId ?? null,
        senderName,
        senderRole,
        body: msg.body,
        kind: msg.kind as 'USER' | 'SYSTEM' | 'SUPPORT',
        photoUrl: msg.photoPath ? (signedUrls.get(msg.photoPath) ?? null) : null,
        documentUrl: msg.documentPath ? (signedUrls.get(msg.documentPath) ?? null) : null,
        documentName: msg.documentName ?? null,
        createdAt: msg.createdAt.toISOString(),
        deleted: msg.deletedAt !== null,
        deletedAt: msg.deletedAt ? msg.deletedAt.toISOString() : null,
      };
    });

    const firstCommande = row.demande?.commandes?.[0];
    const commande = firstCommande
      ? {
          id: firstCommande.id,
          status: firstCommande.status,
          totalCents: firstCommande.totalCents,
          disputeId: firstCommande.dispute?.id ?? null,
        }
      : null;

    const clientAvatarUrl = clientAvatarPath ? (signedUrls.get(clientAvatarPath) ?? null) : null;
    const repairerAvatarUrl = repairerAvatarPath
      ? (signedUrls.get(repairerAvatarPath) ?? null)
      : null;

    const repairerCompanyName = row.repairer.repairerProfile?.displayName ?? null;

    const isRepairerVerified =
      row.repairer.profile?.verificationLevel === 'BUSINESS' ||
      row.repairer.profile?.verificationLevel === 'IDENTITY';

    return {
      id: row.id,
      demande: row.demande
        ? {
            id: row.demande.id,
            title: row.demande.title,
            status: row.demande.status,
            categoryLabel: row.demande.category?.labelFr ?? null,
            budgetCents: row.demande.budgetCents ?? null,
          }
        : null,
      client: {
        id: row.client.id,
        name: row.client.name,
        email: row.client.email,
        phone: row.client.phone ?? null,
        avatarUrl: clientAvatarUrl,
        createdAt: row.client.createdAt.toISOString(),
      },
      repairer: {
        id: row.repairer.id,
        name: row.repairer.name,
        email: row.repairer.email,
        phone: row.repairer.phone ?? null,
        companyName: repairerCompanyName,
        avatarUrl: repairerAvatarUrl,
        verified: isRepairerVerified,
      },
      commande,
      closed: row.deletedAt !== null,
      closedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reportsCount: row.reports?.length ?? 0,
      messages,
    };
  }

  /**
   * Moderation action: closes a conversation by stamping deletedAt, which also takes it out of
   * both participants' inboxes. The controller's @Audit writes the audit row.
   */
  async closeConversation(id: string): Promise<void> {
    await this.setClosed(id, new Date());
  }

  /** Moderation action: reopens a closed conversation by clearing deletedAt. */
  async reopenConversation(id: string): Promise<void> {
    await this.setClosed(id, null);
  }

  private async setClosed(id: string, deletedAt: Date | null): Promise<void> {
    try {
      await this.prisma.conversation.update({ where: { id }, data: { deletedAt } });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        throw new AppException('NOT_FOUND', 'Conversation introuvable.');
      }
      throw err;
    }
  }

  /**
   * Calculates platform-wide conversation KPI metrics.
   */
  async getConversationKpis(): Promise<AdminConversationKpis> {
    const real = GENUINE_PARTICIPANTS_WHERE;
    const [total, activeCount, closedCount, withDisputeCount, withReportCount] = await Promise.all([
      this.prisma.conversation.count({ where: real }),
      this.prisma.conversation.count({ where: { ...real, deletedAt: null } }),
      this.prisma.conversation.count({ where: { ...real, deletedAt: { not: null } } }),
      this.prisma.conversation.count({
        where: { ...real, demande: { commandes: { some: { dispute: { isNot: null } } } } },
      }),
      this.prisma.conversation.count({ where: { ...real, reports: { some: {} } } }),
    ]);

    return {
      total,
      activeCount,
      closedCount,
      withDisputeCount,
      withReportCount,
    };
  }

  /**
   * Ids of the conversations whose participants, demande title or any message contain `term`,
   * folded in SQL with `unaccent` on both sides (same method as `searchFilter` in
   * `demandes.service.ts`): « Eleonore » finds « Éléonore » whatever the word count, where the
   * variant guess it replaces stopped at 16 spellings. `position()` rather than `LIKE`, so a `%`
   * typed by the operator is a character.
   */
  private async searchConversationIds(term: string): Promise<string[]> {
    const folded = Prisma.sql`unaccent(lower(${term}::text))`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c."id"
      FROM "Conversation" c
      JOIN "user" cu ON cu."id" = c."clientUserId"
      JOIN "user" ru ON ru."id" = c."repairerUserId"
      LEFT JOIN "RepairerProfile" rp ON rp."userId" = ru."id"
      LEFT JOIN "Demande" d ON d."id" = c."demandeId"
      WHERE position(${folded} in unaccent(lower(cu."name"))) > 0
        OR position(${folded} in unaccent(lower(cu."email"))) > 0
        OR position(${folded} in unaccent(lower(ru."name"))) > 0
        OR position(${folded} in unaccent(lower(ru."email"))) > 0
        OR position(${folded} in unaccent(lower(coalesce(rp."displayName", '')))) > 0
        OR position(${folded} in unaccent(lower(coalesce(d."title", '')))) > 0
        OR EXISTS (
          SELECT 1 FROM "Message" m
          WHERE m."conversationId" = c."id"
            AND position(${folded} in unaccent(lower(m."body"))) > 0
        )
    `);
    return rows.map((r) => r.id);
  }

  /**
   * Helper to sign media URLs safely with fallbacks.
   */
  private async signMediaUrls(
    photoPaths: string[],
    documentPaths: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (photoPaths.length === 0 && documentPaths.length === 0) return result;

    try {
      const gateway = storageGateway();
      if (typeof (gateway as any).getSignedUrl === 'function') {
        await Promise.all([
          ...photoPaths.map(async (p) => {
            const url = await (gateway as any).getSignedUrl(p, PHOTO_BUCKET);
            if (url) result.set(p, url);
          }),
          ...documentPaths.map(async (p) => {
            const url = await (gateway as any).getSignedUrl(p, attachmentBucket());
            if (url) result.set(p, url);
          }),
        ]);
        return result;
      }

      if (typeof (gateway as any).getPublicUrl === 'function') {
        for (const p of photoPaths) {
          const url = await (gateway as any).getPublicUrl(p);
          if (url) result.set(p, url);
        }
        for (const p of documentPaths) {
          const url = await (gateway as any).getPublicUrl(p);
          if (url) result.set(p, url);
        }
        return result;
      }

      const signed = await signAttachmentUrls({ photo: photoPaths, document: documentPaths });
      return signed;
    } catch {
      return result;
    }
  }
}
