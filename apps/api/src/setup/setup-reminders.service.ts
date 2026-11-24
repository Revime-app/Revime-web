import { Injectable, Logger } from '@nestjs/common';
import { setupReminderFirstText, setupReminderSecondText } from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { GENUINE_USER_WHERE } from '../admin/admin-constants.js';
import { PUBLIC_DEMANDE_WHERE } from '../demandes/demande-predicates.js';
import { loadMatchingCategoryIds } from '../demandes/matching-demande-where.js';
import { byDistanceKm, distanceKm, type Coords } from '../geo/haversine.js';
import { loadRepairerJourneys, type LoadedJourney } from './setup-journey.js';
import { isParisDaytime, reminderDue } from './setup-reminders.js';

/** How many recent requests the 8-day reminder chooses its nudge from. */
const NUDGE_CANDIDATES = 50;

/**
 * V8 E1, `DEC8-08` (1), (4), (5). The 3- and 8-day « finish your setup » reminders, run by the cron
 * (`CronService.run`, job `setupReminders`). Each reminder is sent at most once: its marker is CLAIMED with a
 * conditional `updateMany` before the notification goes out, so two overlapping runs cannot both send it.
 * `NotificationsService.emit` applies the « Offres et demandes » switch and sends the push.
 */
@Injectable()
export class SetupRemindersService {
  private readonly logger = new Logger(SetupRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async sweep(now: Date = new Date()): Promise<{ scanned: number; acted: number; failed: number }> {
    if (!isParisDaytime(now)) return { scanned: 0, acted: 0, failed: 0 };

    const rows = await loadRepairerJourneys(this.prisma, {
      deletedAt: null,
      OR: [{ setupReminder3dAt: null }, { setupReminder8dAt: null }],
      user: {
        ...GENUINE_USER_WHERE,
        OR: [{ banned: false }, { banned: null }],
        profile: { repairerEnabled: true, repairerSuspendedAt: null, deletedAt: null },
      },
    });

    let acted = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        if (await this.handle(row, now)) acted += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(`[setupReminders] failed for user ${row.userId}`, error as Error);
      }
    }
    return { scanned: rows.length, acted, failed };
  }

  /** True when a reminder was sent. */
  private async handle(row: LoadedJourney, now: Date): Promise<boolean> {
    const due = reminderDue({ ...row, complete: row.journey.complete }, now);
    if (due === 'NONE') return false;

    if (due === 'SETTLE') {
      await this.prisma.repairerProfile.updateMany({
        where: { id: row.id },
        data: {
          ...(row.setupReminder3dAt === null ? { setupReminder3dAt: now } : {}),
          ...(row.setupReminder8dAt === null ? { setupReminder8dAt: now } : {}),
        },
      });
      return false;
    }

    if (due === 'FIRST') {
      const claimed = await this.prisma.repairerProfile.updateMany({
        where: { id: row.id, setupReminder3dAt: null },
        data: { setupReminder3dAt: now },
      });
      if (claimed.count !== 1) return false;
      await this.notifications.emit({
        userId: row.userId,
        mode: 'REPAIRER',
        type: 'SETUP_REMINDER',
        subject: setupReminderFirstText(row.journey.total - row.journey.completed),
        demandeId: null,
      });
      return true;
    }

    // SECOND. A missed 3-day reminder is settled with it, never sent late.
    const claimed = await this.prisma.repairerProfile.updateMany({
      where: { id: row.id, setupReminder8dAt: null },
      data: { setupReminder8dAt: now, ...(row.setupReminder3dAt === null ? { setupReminder3dAt: now } : {}) },
    });
    if (claimed.count !== 1) return false;
    const pick = await this.pickNudgeDemande(row.userId, row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null);
    await this.notifications.emit({
      userId: row.userId,
      mode: 'REPAIRER',
      type: 'SETUP_REMINDER',
      subject: setupReminderSecondText(pick?.title ?? null, row.journey.minutesLeft),
      demandeId: pick?.id ?? null,
    });
    return true;
  }

  /**
   * `DEC8-08` (1): an open public request he could answer, in his categories (all of them when he declared
   * none), the nearest of the newest when he has a location, else the newest.
   */
  private async pickNudgeDemande(userId: string, from: Coords | null): Promise<{ id: string; title: string } | null> {
    const categoryIds = await loadMatchingCategoryIds(this.prisma, userId);
    const where: Prisma.DemandeWhereInput = {
      status: 'OPEN',
      ...PUBLIC_DEMANDE_WHERE,
      authorUserId: { not: userId },
      ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}),
    };
    const candidates = await this.prisma.demande.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: NUDGE_CANDIDATES,
      select: { id: true, title: true, lat: true, lng: true, createdAt: true },
    });
    const coords = (d: { lat: number | null; lng: number | null }): Coords | null =>
      d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null;
    // Newest first already; a stable sort keeps the newest among equal (or unknown) distances.
    const ordered =
      from === null
        ? candidates
        : [...candidates].sort((a, b) => byDistanceKm(distanceKm(from, coords(a)), distanceKm(from, coords(b))));
    const pick = ordered[0];
    return pick ? { id: pick.id, title: pick.title } : null;
  }
}
