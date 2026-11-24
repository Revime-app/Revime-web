import { Injectable } from '@nestjs/common';
import { DEFAULT_PLATFORM_SETTINGS, type PlatformStatus } from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** The guard reads the status on every request while a gate is enforced; this keeps it one read per 10 s. */
const CACHE_MS = 10_000;

/**
 * V7 D5 (U9, U9b, `DEC7-24`). The public half of `PlatformSettings`: maintenance and its message, the
 * active CGU version with the force flag and that version's summary and date, and the active
 * mentions légales version. Read-only: with no settings row it answers the defaults rather than
 * creating one, which stays `AdminSettingsService.getSettings`'s job.
 */
@Injectable()
export class PlatformStatusService {
  private cached: { at: number; value: PlatformStatus } | null = null;

  /** Replaced in specs. */
  now: () => number = () => Date.now();

  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<PlatformStatus> {
    const at = this.now();
    if (this.cached && at - this.cached.at < CACHE_MS) return this.cached.value;
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: 'singleton' },
      select: {
        maintenanceEnabled: true,
        maintenanceMessage: true,
        cguCurrentVersion: true,
        cguForceReaccept: true,
        legalNoticeVersion: true,
      },
    });
    const cguVersion = row?.cguCurrentVersion ?? DEFAULT_PLATFORM_SETTINGS.cguCurrentVersion;
    const cguRow = await this.prisma.legalDocumentVersion.findUnique({
      where: { kind_version: { kind: 'CGU', version: cguVersion } },
      select: { summary: true, publishedAt: true },
    });
    const value: PlatformStatus = {
      maintenance: {
        enabled: row?.maintenanceEnabled ?? DEFAULT_PLATFORM_SETTINGS.maintenanceEnabled,
        message: row?.maintenanceMessage ?? DEFAULT_PLATFORM_SETTINGS.maintenanceMessage,
      },
      cgu: {
        version: cguVersion,
        forceReaccept: row?.cguForceReaccept ?? DEFAULT_PLATFORM_SETTINGS.cguForceReaccept,
        summary: cguRow?.summary ?? null,
        publishedAt: cguRow?.publishedAt?.toISOString() ?? null,
      },
      legalNotice: { version: row?.legalNoticeVersion ?? DEFAULT_PLATFORM_SETTINGS.legalNoticeVersion },
    };
    this.cached = { at, value };
    return value;
  }
}
