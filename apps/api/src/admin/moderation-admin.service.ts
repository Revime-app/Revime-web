import { Injectable } from '@nestjs/common';
import {
  REPORT_GRAVITY_BY_REASON,
  REPORT_GRAVITY_LABEL,
  REPORT_REASON_LABEL,
  REPORT_RESOLUTION_VERDICT_LABEL,
  type AdminConversationView,
  type AdminReportDetailDto,
  type AdminReportListItemDto,
  type AdminReportListResponse,
  type ReportGravity,
  type ReportReason,
  type ReportResolutionVerdict,
  type ReportTargetEntitySummary,
  type ReportTargetType,
  type ResolveReportBody,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isDeletedAccount } from './deleted-account.js';
import { PrismaService } from '../prisma/prisma.service.js';

const NOT_FOUND = 'Ressource introuvable.';

export interface AdminReportsQuery {
  q?: string;
  status?: 'OPEN' | 'RESOLVED' | 'ALL';
  gravity?: ReportGravity | 'ALL';
  assignment?: 'MINE' | 'UNASSIGNED' | 'ALL';
  actorUserId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'gravity_desc' | 'created_asc' | 'created_desc';
}

const GRAVITY_SCORE: Record<ReportGravity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

@Injectable()
export class ModerationAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rich moderation queue query with filtering by status, gravity, assignment,
   * search query across participants and demande, pagination, and oldest-first
   * queue discipline by default.
   */
  async listReports(query: AdminReportsQuery = {}): Promise<AdminReportListResponse> {
    const page = Math.max(Math.trunc(query.page ?? 1) || 1, 1);
    const rawSize = Math.trunc(query.pageSize ?? 20) || 20;
    const pageSize = Math.min(100, Math.max(1, rawSize));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const and: Record<string, unknown>[] = [];

    // Status filtering: OPEN (default), RESOLVED, ALL
    if (query.status === 'RESOLVED') {
      and.push({ resolvedAt: { not: null } });
    } else if (query.status === 'ALL') {
      // no resolvedAt filter
    } else {
      and.push({ resolvedAt: null });
    }

    // Gravity filtering
    if (query.gravity && query.gravity !== 'ALL') {
      const reasons = (Object.entries(REPORT_GRAVITY_BY_REASON) as [ReportReason, ReportGravity][])
        .filter(([_, g]) => g === query.gravity)
        .map(([reason]) => reason);
      if (reasons.length > 0) {
        and.push({ reason: { in: reasons } });
      }
    }

    // Assignment filtering
    if (query.assignment === 'MINE') {
      and.push({ assignedToUserId: query.actorUserId ?? '__none__' });
    } else if (query.assignment === 'UNASSIGNED') {
      and.push({ assignedToUserId: null });
    }

    // Search query q
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { reporter: { name: { contains: q, mode: 'insensitive' } } },
          { reporter: { email: { contains: q, mode: 'insensitive' } } },
          { reported: { name: { contains: q, mode: 'insensitive' } } },
          { reported: { email: { contains: q, mode: 'insensitive' } } },
          { conversation: { demande: { is: { title: { contains: q, mode: 'insensitive' } } } } },
        ],
      });
    }

    const where = and.length > 0 ? { AND: and } : {};

    const select = {
      id: true,
      conversationId: true,
      reason: true,
      createdAt: true,
      resolvedAt: true,
      resolutionVerdict: true,
      assignedToUserId: true,
      reporter: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reported: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      conversation: {
        select: {
          deletedAt: true,
          demande: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    };

    let rows: any[];
    let total: number;
    let openCount: number;
    let resolvedCount: number;

    if (query.sortBy === 'gravity_desc') {
      const [allMatchingRows, open, resolved] = await Promise.all([
        this.prisma.conversationReport.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          select,
        }),
        this.prisma.conversationReport.count({ where: { resolvedAt: null } }),
        this.prisma.conversationReport.count({ where: { resolvedAt: { not: null } } }),
      ]);

      allMatchingRows.sort((a, b) => {
        const ga = REPORT_GRAVITY_BY_REASON[a.reason as ReportReason] ?? 'LOW';
        const gb = REPORT_GRAVITY_BY_REASON[b.reason as ReportReason] ?? 'LOW';
        const diff = (GRAVITY_SCORE[gb] ?? 0) - (GRAVITY_SCORE[ga] ?? 0);
        if (diff !== 0) return diff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      total = allMatchingRows.length;
      rows = allMatchingRows.slice(skip, skip + take);
      openCount = open;
      resolvedCount = resolved;
    } else {
      const orderBy = query.sortBy === 'created_desc' ? { createdAt: 'desc' as const } : { createdAt: 'asc' as const };

      const [pagedRows, count, open, resolved] = await Promise.all([
        this.prisma.conversationReport.findMany({
          where,
          skip,
          take,
          orderBy,
          select,
        }),
        this.prisma.conversationReport.count({ where }),
        this.prisma.conversationReport.count({ where: { resolvedAt: null } }),
        this.prisma.conversationReport.count({ where: { resolvedAt: { not: null } } }),
      ]);

      rows = pagedRows;
      total = count;
      openCount = open;
      resolvedCount = resolved;
    }

    const operatorIds = Array.from(
      new Set(
        rows
          .map((r) => r.assignedToUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const operators =
      operatorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: {
              id: true,
              name: true,
              email: true,
              profile: { select: { deletedAt: true } },
            },
          })
        : [];

    // Display only (B16): deleting an account releases its assignments in its own transaction.
    const deletedOpIds = new Set(operators.filter(isDeletedAccount).map((op) => op.id));
    const operatorMap = new Map(operators.map((op) => [op.id, op]));

    const items: AdminReportListItemDto[] = rows.map((row) => {
      const reason = row.reason as ReportReason;
      const gravity = REPORT_GRAVITY_BY_REASON[reason] ?? 'LOW';
      const isAssigneeDeleted = row.assignedToUserId ? deletedOpIds.has(row.assignedToUserId) : false;
      const op = row.assignedToUserId && !isAssigneeDeleted ? operatorMap.get(row.assignedToUserId) : null;

      return {
        id: row.id,
        conversationId: row.conversationId,
        reason,
        gravity,
        gravityLabel: REPORT_GRAVITY_LABEL[gravity],
        reasonLabel: REPORT_REASON_LABEL[reason] ?? row.reason,
        targetType: ((row as any).targetType as ReportTargetType) ?? 'MESSAGE',
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
        resolvedAt: row.resolvedAt
          ? (row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : new Date(row.resolvedAt).toISOString())
          : null,
        resolutionVerdict: (row.resolutionVerdict as ReportResolutionVerdict) ?? null,
        reporter: {
          id: row.reporter.id,
          name: row.reporter.name,
          email: row.reporter.email,
        },
        reported: {
          id: row.reported.id,
          name: row.reported.name,
          email: row.reported.email,
        },
        demande: row.conversation.demande
          ? {
              id: row.conversation.demande.id,
              title: row.conversation.demande.title,
            }
          : null,
        assignedTo: op
          ? {
              id: op.id,
              name: op.name,
              email: op.email,
            }
          : null,
        conversationClosed: row.conversation.deletedAt !== null,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      counts: {
        open: openCount,
        resolved: resolvedCount,
        total: openCount + resolvedCount,
      },
    };
  }

  /**
   * Dossier inspection: queries report, reporter and reported user statistics,
   * full conversation messages, and operator attribution.
   */
  async getReportDetail(id: string): Promise<AdminReportDetailDto> {
    const report = await this.prisma.conversationReport.findUnique({
      where: { id },
      select: {
        id: true,
        conversationId: true,
        reporterUserId: true,
        reportedUserId: true,
        reason: true,
        createdAt: true,
        resolvedAt: true,
        assignedToUserId: true,
        assignedAt: true,
        resolvedByUserId: true,
        resolutionVerdict: true,
        resolutionNote: true,
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
        reported: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            role: true,
            banned: true,
            profile: {
              select: {
                repairerSuspendedAt: true,
              },
            },
          },
        },
        conversation: {
          select: {
            id: true,
            deletedAt: true,
            demande: {
              select: {
                id: true,
                title: true,
              },
            },
            messages: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                body: true,
                createdAt: true,
                deletedAt: true,
                senderUserId: true,
                sender: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!report) {
      throw new AppException('NOT_FOUND', 'Signalement introuvable.');
    }

    const operatorIds = [report.assignedToUserId, report.resolvedByUserId].filter(
      (uid): uid is string => Boolean(uid),
    );

    const [reportsCount, reportsReceivedCount, operatorUsers] = await Promise.all([
      this.prisma.conversationReport.count({
        where: { reporterUserId: report.reporterUserId },
      }),
      this.prisma.conversationReport.count({
        where: { reportedUserId: report.reportedUserId },
      }),
      operatorIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: operatorIds } },
            select: {
              id: true,
              name: true,
              email: true,
              profile: { select: { deletedAt: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const opMap = new Map(operatorUsers.map((u: any) => [u.id, u]));
    let assignedUser = report.assignedToUserId ? opMap.get(report.assignedToUserId) : null;
    const resolvedByUser = report.resolvedByUserId ? opMap.get(report.resolvedByUserId) : null;

    // Display only (B16): a removed or deleted assignee reads as unassigned.
    if (report.assignedToUserId && (!assignedUser || isDeletedAccount(assignedUser))) {
      assignedUser = null;
    }

    const reason = report.reason as ReportReason;
    const gravity = REPORT_GRAVITY_BY_REASON[reason] ?? 'LOW';
    const resolutionVerdict = (report.resolutionVerdict as ReportResolutionVerdict) ?? null;

    // The only writer of a ConversationReport (`POST /conversations/:id/report`) stores a
    // conversation and a reason: it cannot name a message, a profile, a review or a demande. So
    // every report is a MESSAGE report, and what the page can show of its target is what the
    // thread holds. Never invent a summary for a target type the data cannot carry.
    const targetType: ReportTargetType = 'MESSAGE';

    // An ESTIMATE, not a record: the reported user's last message at or before the report, else
    // their first, else the thread's first. The page labels it as such.
    let likelyReportedMessageId: string | null = null;
    const threadMessages = report.conversation?.messages ?? [];
    if (threadMessages.length > 0) {
      const reportedUserMessages = threadMessages.filter((m) => m.senderUserId === report.reportedUserId);
      if (reportedUserMessages.length > 0) {
        const reportTime = new Date(report.createdAt).getTime();
        const beforeOrAt = reportedUserMessages.filter((m) => new Date(m.createdAt).getTime() <= reportTime);
        likelyReportedMessageId = (beforeOrAt.length > 0 ? beforeOrAt[beforeOrAt.length - 1] : reportedUserMessages[0])!.id;
      } else {
        likelyReportedMessageId = threadMessages[0]!.id;
      }
    }

    const likelyMessage = threadMessages.find((m) => m.id === likelyReportedMessageId);
    const targetEntitySummary: ReportTargetEntitySummary = {
      id: likelyMessage?.id ?? report.id,
      targetType: 'MESSAGE',
      title: `Message de ${report.reported.name}`,
      description: likelyMessage ? likelyMessage.body : 'Message signalé dans la conversation.',
    };

    return {
      id: report.id,
      conversationId: report.conversationId,
      reason,
      reasonLabel: REPORT_REASON_LABEL[reason] ?? report.reason,
      gravity,
      gravityLabel: REPORT_GRAVITY_LABEL[gravity],
      targetType,
      likelyReportedMessageId,
      targetEntitySummary,
      createdAt: report.createdAt instanceof Date ? report.createdAt.toISOString() : new Date(report.createdAt).toISOString(),
      resolvedAt: report.resolvedAt
        ? (report.resolvedAt instanceof Date ? report.resolvedAt.toISOString() : new Date(report.resolvedAt).toISOString())
        : null,
      resolutionVerdict,
      resolutionVerdictLabel: resolutionVerdict
        ? (REPORT_RESOLUTION_VERDICT_LABEL[resolutionVerdict] ?? resolutionVerdict)
        : null,
      resolutionNote: report.resolutionNote ?? null,
      assignedTo: assignedUser
        ? {
            id: assignedUser.id,
            name: assignedUser.name,
            email: assignedUser.email,
            assignedAt: report.assignedAt
              ? (report.assignedAt instanceof Date ? report.assignedAt.toISOString() : new Date(report.assignedAt).toISOString())
              : (report.createdAt instanceof Date ? report.createdAt.toISOString() : new Date(report.createdAt).toISOString()),
          }
        : null,
      resolvedBy: resolvedByUser
        ? {
            id: resolvedByUser.id,
            name: resolvedByUser.name,
            email: resolvedByUser.email,
          }
        : null,
      reporter: {
        id: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
        createdAt: report.reporter.createdAt instanceof Date
          ? report.reporter.createdAt.toISOString()
          : new Date(report.reporter.createdAt).toISOString(),
        reportsCount,
      },
      reported: {
        id: report.reported.id,
        name: report.reported.name,
        email: report.reported.email,
        createdAt: report.reported.createdAt instanceof Date
          ? report.reported.createdAt.toISOString()
          : new Date(report.reported.createdAt).toISOString(),
        role: report.reported.role ?? 'client',
        banned: Boolean(report.reported.banned),
        repairerSuspended: Boolean(report.reported.profile?.repairerSuspendedAt),
        reportsReceivedCount,
      },
      conversation: {
        id: report.conversation.id,
        closed: report.conversation.deletedAt !== null,
        demande: report.conversation.demande
          ? {
              id: report.conversation.demande.id,
              title: report.conversation.demande.title,
            }
          : null,
        messages: report.conversation.messages.map((m) => ({
          id: m.id,
          body: m.body,
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : new Date(m.createdAt).toISOString(),
          deleted: m.deletedAt !== null,
          senderId: m.senderUserId ?? null,
          senderName: m.sender?.name ?? 'Revime (message automatique)',
        })),
      },
    };
  }

  /**
   * Read before act. The operator is about to close a private channel; P4's `/colis`
   * review established that a destructive action offered with nothing to check against
   * lets a mis-keyed id through every guard.
   *
   * No `deletedAt` filter on the conversation OR the messages: a closed channel must
   * still be readable, or the reopen decision is taken blind, and a removed message
   * must still be visible to the operator who removed it.
   */
  async viewConversation(conversationId: string): Promise<AdminConversationView> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        deletedAt: true,
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            createdAt: true,
            deletedAt: true,
            sender: { select: { name: true } },
          },
        },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    return {
      conversationId: row.id,
      demandeTitle: row.demande?.title ?? 'Demande de devis',
      clientName: row.client.name,
      repairerName: row.repairer.name,
      closed: row.deletedAt !== null,
      messages: row.messages.map((m) => ({
        id: m.id,
        body: m.body,
        // A SYSTEM message has no author. CF-05 permits the legal name on this surface --
        // admin moderation is one of its two named exceptions -- but a null sender still
        // needs a branch, and the label must not imply a person wrote it.
        senderName: m.sender?.name ?? 'Revime (message automatique)',
        createdAt: m.createdAt.toISOString(),
        deleted: m.deletedAt !== null,
      })),
    };
  }

  /**
   * Assign a report to an operator for review.
   */
  async assignReport(id: string, actorUserId: string): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        name: true,
        profile: { select: { deletedAt: true } },
      },
    });
    if (actor && isDeletedAccount(actor)) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Impossible d'assigner à un utilisateur supprimé.");
    }

    const { count } = await this.prisma.conversationReport.updateMany({
      where: { id },
      data: {
        assignedToUserId: actorUserId,
        assignedAt: new Date(),
      },
    });
    if (count === 0) throw new AppException('NOT_FOUND', 'Signalement introuvable.');
  }

  /**
   * Release assignment of a report back to the unassigned queue.
   */
  async unassignReport(id: string): Promise<void> {
    const existing = await this.prisma.conversationReport.findUnique({
      where: { id },
      select: { id: true, resolvedAt: true },
    });
    if (!existing) throw new AppException('NOT_FOUND', 'Signalement introuvable.');
    if (existing.resolvedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Impossible de modifier un signalement déjà résolu.');
    }

    await this.prisma.conversationReport.updateMany({
      where: { id },
      data: {
        assignedToUserId: null,
        assignedAt: null,
      },
    });
  }

  /**
   * Resolve a report with structured verdict, optional note, and operator attribution.
   *
   * Idempotent on an already-resolved report, and the FIRST decision stands: a double click
   * (or a second operator) must not overwrite the verdict, the note or who decided. The 404 is
   * for an id that does not exist, which is the mis-key this checks for.
   */
  async resolveReport(
    id: string,
    actorUserId: string,
    body?: Partial<ResolveReportBody>,
  ): Promise<void> {
    const { count } = await this.prisma.conversationReport.updateMany({
      where: { id, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: actorUserId,
        resolutionVerdict: body?.verdict ?? 'RESOLVED_OTHER',
        resolutionNote: body?.note?.trim() || null,
      },
    });
    if (count === 0) {
      const existing = await this.prisma.conversationReport.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new AppException('NOT_FOUND', 'Signalement introuvable.');
    }
  }

  /**
   * Close the channel. A SOFT delete, so the evidence a report rests on survives.
   *
   * Idempotent: closing an already-closed conversation re-stamps. Deliberately not a
   * refusal, because the page can race with itself and the outcome asked for is the
   * outcome reached.
   */
  async closeConversation(conversationId: string): Promise<void> {
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new AppException('NOT_FOUND', NOT_FOUND);
  }

  /**
   * The undo, and spec §8.1 is why it exists: without it, closing a channel is
   * irreversible from one click on a web page and recoverable only by a hand-written
   * UPDATE against production. This project records exactly one place needing that
   * (a won dispute) and records it as a limitation accepted reluctantly.
   *
   * **Writes `deletedAt` and NOTHING else.** It does not unblock - a `Block` is the
   * user's own decision and an operator undoing it would take a safety control from
   * the person who set it. It does not clear `resolvedAt`. Both are pinned by a test,
   * because "restore everything" is the tempting shape.
   *
   * Note the user-facing refusal in `getOrCreate` is untouched: « Cette conversation a
   * été fermée. » still refuses a USER reviving a channel. An operator is a different
   * actor, which is the whole distinction §8.1 draws.
   */
  async reopenConversation(conversationId: string): Promise<void> {
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { deletedAt: null },
    });
    if (count === 0) throw new AppException('NOT_FOUND', NOT_FOUND);
  }

  /**
   * Remove one message from both parties' view while keeping the row. `body` is
   * deliberately NOT overwritten: the schema's own comment says a soft delete keeps
   * the evidence a report rests on, and blanking the text would destroy exactly that.
   */
  async deleteMessage(messageId: string): Promise<void> {
    const { count } = await this.prisma.message.updateMany({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new AppException('NOT_FOUND', NOT_FOUND);
  }

  // `deleteReview` (étape 5 piece 3: no motif, no restore, no page) was REMOVED by CF4-L.
  // Reviews are hidden and restored by AdminReviewsService, with a required motif.
}
