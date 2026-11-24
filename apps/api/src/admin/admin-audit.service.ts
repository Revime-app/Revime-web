import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type AdminAuditEntry,
  type AdminAuditListQuery,
  type AdminAuditListResponse,
  type AdminAuditDetailedEntry,
  type AdminAuditKpis,
  getDomainForAction,
  getActionLabel,
  parisDayStart,
  parisYmdOf,
  ADMIN_AUDIT_DOMAINS,
  type AdminAuditDomain,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAuditRow, type AuditRecordInput } from './admin-audit-write.js';

export type { AuditRecordInput };

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  let str = typeof val === 'string' ? val : String(val);
  if (str.length > 0 && ['=', '+', '-', '@'].includes(str.charAt(0))) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Delegates to the single writer. See admin-audit-write.ts for the never-throw rule. */
  async record(input: AuditRecordInput): Promise<void> {
    await writeAuditRow(this.prisma, input, (message, err) =>
      err === undefined ? this.logger.error(message) : this.logger.error(message, err as Error),
    );
  }

  async list(limit: number): Promise<AdminAuditEntry[]> {
    // Clamp to [1, 100]. BOTH guards are load-bearing and neither is redundant:
    //   `|| 1`     catches NaN - the controller passes Number(query), so ?limit=abc
    //              arrives as NaN, and Math.max(NaN, 1) is NaN, not 1.
    //   Math.max   catches negatives - a negative `take` is not merely invalid to Prisma;
    //              it means "take from the other end", so an unclamped ?limit=-5 would
    //              return the oldest rows under a heading that says « Dernières actions ».
    // Removing either one sends a bad `take` to Prisma. Pinned by the tests below.
    const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 100);

    const rows = await this.prisma.adminAuditLog.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actorEmail: true,
        action: true,
        targetType: true,
        targetId: true,
        statusCode: true,
        createdAt: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      actorEmail: r.actorEmail,
      // Rows are written through adminAuditActionSchema, so the column holds only its members.
      action: r.action as AdminAuditEntry['action'],
      targetType: r.targetType,
      targetId: r.targetId,
      statusCode: r.statusCode,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private buildWhere(query: Partial<AdminAuditListQuery>): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (query.actorEmail) {
      where.actorEmail = { contains: query.actorEmail, mode: 'insensitive' };
    }

    if (query.domain) {
      const actions = (ADMIN_AUDIT_DOMAINS[query.domain]?.actions as string[]) || [];
      where.action = { in: actions };
    }

    if (query.action) {
      where.action = { equals: query.action };
    }

    if (query.targetType) {
      where.targetType = { equals: query.targetType };
    }

    if (query.targetId) {
      where.targetId = { contains: query.targetId, mode: 'insensitive' };
    }

    if (query.statusCode !== undefined) {
      where.statusCode = { equals: query.statusCode };
    } else if (query.statusFamily) {
      if (query.statusFamily === '2xx') {
        where.statusCode = { gte: 200, lte: 299 };
      } else if (query.statusFamily === '4xx') {
        where.statusCode = { gte: 400, lte: 499 };
      } else if (query.statusFamily === '5xx') {
        where.statusCode = { gte: 500, lte: 599 };
      }
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    if (query.q) {
      where.OR = [
        { actorEmail: { contains: query.q, mode: 'insensitive' } },
        { targetId: { contains: query.q, mode: 'insensitive' } },
        { action: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private mapRowToDetailedEntry(row: {
    id: string;
    actorUserId: string | null;
    actorEmail: string;
    actorRole: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    statusCode: number;
    detail: unknown;
    createdAt: Date | string;
  }): AdminAuditDetailedEntry {
    return {
      id: row.id,
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail,
      actorRole: row.actorRole,
      action: row.action as AdminAuditDetailedEntry['action'],
      actionLabel: getActionLabel(row.action),
      domain: getDomainForAction(row.action),
      targetType: row.targetType,
      targetId: row.targetId,
      statusCode: row.statusCode,
      detail: (row.detail as Record<string, unknown> | null) ?? null,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString(),
    };
  }

  async listWithFilters(query: Partial<AdminAuditListQuery> = {}): Promise<AdminAuditListResponse> {
    const where = this.buildWhere(query);
    const take = query.limit ?? 25;
    const page = query.page ?? 1;
    const skip = (page - 1) * take;

    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    const items = rows.map((row) => this.mapRowToDetailedEntry(row));
    const totalPages = Math.ceil(total / take) || 0;

    return {
      items,
      total,
      page,
      pageSize: take,
      totalPages,
    };
  }

  async getAuditKpis(): Promise<AdminAuditKpis> {
    const now = new Date();
    // The operator's day, not the server's: Render runs in UTC, so a local-time midnight made
    // « aujourd'hui » start two hours late in Paris summer.
    const startOfDay = parisDayStart(parisYmdOf(now));

    const actionsTodayCount = await this.prisma.adminAuditLog.count({
      where: { createdAt: { gte: startOfDay } },
    });
    const totalActionsCount = await this.prisma.adminAuditLog.count();
    const uniqueActorsToday = await this.prisma.adminAuditLog.groupBy({
      by: ['actorEmail'],
      where: { createdAt: { gte: startOfDay } },
    });
    const uniqueActorsTodayCount = uniqueActorsToday.length;

    let actionsForTop = await this.prisma.adminAuditLog.findMany({
      where: { createdAt: { gte: startOfDay } },
      select: { action: true },
    });

    if (actionsForTop.length === 0) {
      actionsForTop = await this.prisma.adminAuditLog.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        select: { action: true },
      });
    }

    let topDomain = 'Aucune activité';
    if (actionsForTop.length > 0) {
      const domainCounts = new Map<AdminAuditDomain, number>();
      for (const item of actionsForTop) {
        const domain = getDomainForAction(item.action);
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      }

      let maxCount = -1;
      let chosenDomain: AdminAuditDomain | null = null;
      for (const [domain, count] of domainCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          chosenDomain = domain;
        }
      }

      if (chosenDomain) {
        topDomain = ADMIN_AUDIT_DOMAINS[chosenDomain]?.label ?? chosenDomain;
      }
    }

    return {
      actionsTodayCount,
      uniqueActorsTodayCount,
      topDomain,
      totalActionsCount,
    };
  }

  async getAuditDetail(id: string): Promise<AdminAuditDetailedEntry> {
    const row = await this.prisma.adminAuditLog.findUnique({
      where: { id },
    });

    if (!row) {
      throw new NotFoundException('Entrée de journal introuvable.');
    }

    return this.mapRowToDetailedEntry(row);
  }

  async exportCsv(query: Partial<AdminAuditListQuery> = {}): Promise<{ filename: string; content: string }> {
    const where = this.buildWhere(query);
    const rows = await this.prisma.adminAuditLog.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });

    const header = 'Date / Heure,Opérateur,Rôle,Domaine,Action,Code Action,Type Cible,ID Cible,Statut HTTP,Détails';

    const dataRows = rows.map((row) => {
      const createdAt = typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString();
      const domain = ADMIN_AUDIT_DOMAINS[getDomainForAction(row.action)]?.label ?? getDomainForAction(row.action);
      const actionLabel = getActionLabel(row.action);
      const details = row.detail ? JSON.stringify(row.detail) : '';

      return [
        escapeCsvValue(createdAt),
        escapeCsvValue(row.actorEmail),
        escapeCsvValue(row.actorRole || ''),
        escapeCsvValue(domain),
        escapeCsvValue(actionLabel),
        escapeCsvValue(row.action),
        escapeCsvValue(row.targetType || ''),
        escapeCsvValue(row.targetId || ''),
        escapeCsvValue(String(row.statusCode)),
        escapeCsvValue(details),
      ].join(',');
    });

    const content = '\uFEFF' + [header, ...dataRows].join('\r\n');
    const filename = `journal-audit-revime-${new Date().toISOString().slice(0, 10)}.csv`;

    return { filename, content };
  }
}
