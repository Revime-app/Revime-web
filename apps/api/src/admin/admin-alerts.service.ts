import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  type AdminAlertType,
  type AdminAlertSeverity,
  type AdminAlertTargetType,
  ADMIN_ALERT_TYPE_LABELS,
  type AdminAlertListQuery,
  type AdminAlertListResponse,
  type AdminAlertItem,
  type AdminAlertKpis,
  type AdminAlertPreferences,
  type AdminAlertPreferencesPatch,
  adminAlertPreferencesSchema,
  DEFAULT_PLATFORM_SETTINGS,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { mailSender, type MailSender } from '../mail/mail.service.js';
import { buildAlertEmail } from '../mail/alert-email.js';

/**
 * The email channel flag that governs each alert type. A Record, so a new AdminAlertType fails to compile here instead of silently getting email.
 * Null: never mailed to OPS_EMAIL. V7 U2's lock-out alerts are null because a staff lock already mails every super admin
 * (auth/throttle/effects.ts) and an ordinary lock or IP block is for the dashboard, not an inbox (Q12).
 */
const EMAIL_FLAG_BY_TYPE: Record<AdminAlertType, keyof AdminAlertPreferences | null> = {
  DISPUTE_NEW: 'emailDisputes',
  REPORT_SEVERE: 'emailReports',
  PAYMENT_FAILED: 'emailPayments',
  PARCEL_INCIDENT: 'emailParcels',
  ACCOUNT_LOCKED: null,
  IP_BLOCKED: null,
  // V7 U2b: a staff account secured already mails every super admin (security.service.ts).
  ACCOUNT_SECURED: null,
  // V9 U3: for the dashboard; the account is already deleted, nothing to act on by e-mail.
  PROVIDER_REVOKE_FAILED: null,
};

export interface CreateAdminAlertInput {
  type: AdminAlertType;
  severity?: AdminAlertSeverity;
  title: string;
  message: string;
  targetType: AdminAlertTargetType;
  targetId: string;
  link: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AdminAlertsService {
  private readonly logger = new Logger(AdminAlertsService.name);
  private readonly mailer: MailSender;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject('ADMIN_ALERT_MAILER') mailer?: MailSender,
  ) {
    this.mailer = mailer ?? mailSender();
  }

  /**
   * The entry point for the producers (disputes, payouts, parcels). Never throws: the event it reports
   * has already happened and committed, and must not fail, or be retried by Stripe, because the alert
   * about it could not be written.
   */
  async raise(input: CreateAdminAlertInput): Promise<void> {
    try {
      await this.createAlert(input);
    } catch (err) {
      this.logger.error(`Could not raise the ${input.type} alert for ${input.targetId}`, err);
    }
  }

  /**
   * Creates an administrative alert with 15-minute sliding window deduplication
   * and non-blocking operational email dispatching to OPS_EMAIL.
   */
  async createAlert(input: CreateAdminAlertInput): Promise<AdminAlertItem> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // 15-minute anti-flood deduplication query
    const existing = await this.prisma.adminAlert.findFirst({
      where: {
        type: input.type,
        targetId: input.targetId,
        createdAt: { gte: fifteenMinutesAgo },
      },
      include: {
        readBy: {
          select: { name: true },
        },
      },
    });

    if (existing) {
      let current = existing;
      if (input.metadata !== undefined) {
        try {
          const updated = await this.prisma.adminAlert.update({
            where: { id: existing.id },
            data: { metadata: input.metadata as any },
            include: {
              readBy: {
                select: { name: true },
              },
            },
          });
          if (updated) {
            current = updated;
          }
        } catch (err) {
          this.logger.warn(`Failed to update metadata for deduplicated alert ${existing.id}: ${(err as Error).message}`);
        }
      }
      return this.mapAlertItem(current);
    }

    const severity = input.severity ?? ADMIN_ALERT_TYPE_LABELS[input.type]?.defaultSeverity ?? 'HIGH';

    const created = await this.prisma.adminAlert.create({
      data: {
        type: input.type,
        severity,
        title: input.title,
        message: input.message,
        targetType: input.targetType,
        targetId: input.targetId,
        link: input.link,
        metadata: (input.metadata as any) ?? undefined,
      },
      include: {
        readBy: {
          select: { name: true },
        },
      },
    });

    // Check notification channel preference and dispatch email non-blockingly
    const opsEmail = process.env.OPS_EMAIL;
    const emailFlag = EMAIL_FLAG_BY_TYPE[input.type];
    const isCategoryEnabled = opsEmail && emailFlag ? (await this.getPreferences())[emailFlag] : false;

    if (isCategoryEnabled && opsEmail) {
      try {
        const { subject, html, text } = buildAlertEmail({
          type: created.type,
          severity: created.severity,
          title: created.title,
          message: created.message,
          targetType: created.targetType,
          targetId: created.targetId,
          link: created.link,
          metadata: (created.metadata as Record<string, unknown>) ?? undefined,
          createdAt: created.createdAt,
        });

        await this.mailer.send({
          to: opsEmail,
          subject,
          html,
          text,
        });

        const now = new Date();
        try {
          await this.prisma.adminAlert.update({
            where: { id: created.id },
            data: {
              emailSent: true,
              emailSentAt: now,
            },
          });
        } catch {
          // Non-blocking update failure
        }
        created.emailSent = true;
        created.emailSentAt = now;
      } catch (err) {
        this.logger.warn(`Failed to dispatch alert email for alert ${created.id}: ${(err as Error).message}`);
      }
    }

    return this.mapAlertItem(created);
  }

  /**
   * Paginated and filtered multi-criteria list query.
   */
  async listAlerts(query: AdminAlertListQuery): Promise<AdminAlertListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.isRead === 'true') {
      where.isRead = true;
    } else if (query.isRead === 'false') {
      where.isRead = false;
    }

    if (query.q && query.q.trim().length > 0) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
        { targetId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.adminAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          readBy: {
            select: { name: true },
          },
        },
      }),
      this.prisma.adminAlert.count({ where }),
      this.getUnreadCount(),
    ]);

    return {
      items: (rows ?? []).map((r: any) => this.mapAlertItem(r)),
      total,
      unreadCount,
      page,
      limit,
    };
  }

  /**
   * Fast indexed unread count for bell popover polling.
   */
  async getUnreadCount(): Promise<number> {
    return await this.prisma.adminAlert.count({
      where: { isRead: false },
    });
  }

  /**
   * Operational summary KPIs across alert categories and severities.
   */
  async getAlertKpis(): Promise<AdminAlertKpis> {
    const [unreadTotal, criticalCount, disputesCount, paymentsCount] = await Promise.all([
      this.prisma.adminAlert.count({ where: { isRead: false } }),
      this.prisma.adminAlert.count({ where: { severity: 'CRITICAL' } }),
      this.prisma.adminAlert.count({ where: { type: 'DISPUTE_NEW' } }),
      this.prisma.adminAlert.count({ where: { type: 'PAYMENT_FAILED' } }),
    ]);

    return {
      unreadTotal,
      criticalCount,
      disputesCount,
      paymentsCount,
    };
  }

  /**
   * Marks a single alert as read with operator attribution.
   */
  async markAsRead(id: string, operatorUserId?: string): Promise<AdminAlertItem> {
    const row = await this.prisma.adminAlert.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
        readByUserId: operatorUserId ?? null,
      },
      include: {
        readBy: {
          select: { name: true },
        },
      },
    });

    return this.mapAlertItem(row);
  }

  /**
   * Marks all pending unread alerts as read in bulk.
   */
  async markAllAsRead(operatorUserId?: string): Promise<{ count: number }> {
    const result = await this.prisma.adminAlert.updateMany({
      where: { isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
        readByUserId: operatorUserId ?? null,
      },
    });

    return { count: result.count };
  }

  /**
   * Operational notification channel preferences, from the PlatformSettings singleton. A missing
   * row or an empty value means every channel is on (the schema fills each default).
   */
  async getPreferences(): Promise<AdminAlertPreferences> {
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: 'singleton' },
      select: { alertPreferences: true },
    });
    return adminAlertPreferencesSchema.parse(row?.alertPreferences ?? {});
  }

  /**
   * Updates partial notification channel toggles and persists them: they used to live in the memory of
   * one API process and were lost at every deploy.
   */
  async updatePreferences(patch: AdminAlertPreferencesPatch): Promise<AdminAlertPreferences> {
    const next = adminAlertPreferencesSchema.parse({
      ...(await this.getPreferences()),
      ...patch,
    });
    await this.prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      create: { ...DEFAULT_PLATFORM_SETTINGS, id: 'singleton', alertPreferences: next },
      update: { alertPreferences: next },
    });
    return next;
  }

  private mapAlertItem(row: any): AdminAlertItem {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      targetType: row.targetType,
      targetId: row.targetId,
      link: row.link,
      isRead: Boolean(row.isRead),
      readAt: row.readAt ? (row.readAt instanceof Date ? row.readAt.toISOString() : String(row.readAt)) : null,
      readByUserId: row.readByUserId ?? null,
      readByUserName: row.readBy?.name ?? null,
      emailSent: Boolean(row.emailSent),
      emailSentAt: row.emailSentAt
        ? row.emailSentAt instanceof Date
          ? row.emailSentAt.toISOString()
          : String(row.emailSentAt)
        : null,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }
}
