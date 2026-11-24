import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_PLATFORM_SETTINGS,
  platformSettingsDtoSchema,
  updatePlatformSettingsSchema,
  type PlatformSettingsDto,
  type UpdatePlatformSettingsDto,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

function toDto(row: any): PlatformSettingsDto {
  return platformSettingsDtoSchema.parse({
    id: 'singleton',
    protectionFixedCents: row.protectionFixedCents,
    protectionRateBp: row.protectionRateBp,
    commissionRateBp: row.commissionRateBp,
    payoutHoldHours: row.payoutHoldHours,
    offerValidityHours: row.offerValidityHours,
    paymentHoldHours: row.paymentHoldHours,
    deliveryHomeEnabled: row.deliveryHomeEnabled,
    deliveryWorkshopEnabled: row.deliveryWorkshopEnabled,
    deliveryParcelEnabled: row.deliveryParcelEnabled,
    carrierMondialRelay: row.carrierMondialRelay,
    carrierChronopost: row.carrierChronopost,
    carrierColissimo: row.carrierColissimo,
    carrierRelaisColis: row.carrierRelaisColis,
    maxInsurableValueCents: row.maxInsurableValueCents,
    cguCurrentVersion: row.cguCurrentVersion,
    cguForceReaccept: row.cguForceReaccept,
    legalNoticeVersion: row.legalNoticeVersion,
    maintenanceEnabled: row.maintenanceEnabled,
    maintenanceMessage: row.maintenanceMessage,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    updatedByUserId: row.updatedByUserId ?? null,
  });
}

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves platform settings singleton. If not present in database,
   * seeds the record with default settings via upsert.
   */
  async getSettings(): Promise<PlatformSettingsDto> {
    let row = await this.prisma.platformSettings.findUnique({
      where: { id: 'singleton' },
    });

    if (!row) {
      row = await this.prisma.platformSettings.upsert({
        where: { id: 'singleton' },
        create: {
          ...DEFAULT_PLATFORM_SETTINGS,
          id: 'singleton',
        },
        update: {},
      });
    }

    return toDto(row);
  }

  /**
   * Updates platform settings with partial input and stamps updatedByUserId. The audit row is
   * written by the controller's @Audit (actor e-mail and role come from the session).
   */
  async updateSettings(
    dto: UpdatePlatformSettingsDto,
    actorUserId: string,
  ): Promise<PlatformSettingsDto> {
    const validated = updatePlatformSettingsSchema.parse(dto);

    // V7 D5 (U9b, `DEC7-24`): the dropdowns pick a PUBLISHED version, the one source sign-up and the
    // re-acceptance read (`FND7-027`). A typed value that names no published PDF is refused.
    const picks = [
      ['CGU', validated.cguCurrentVersion],
      ['MENTIONS_LEGALES', validated.legalNoticeVersion],
    ] as const;
    for (const [kind, version] of picks) {
      if (version === undefined) continue;
      const published = await this.prisma.legalDocumentVersion.findUnique({ where: { kind_version: { kind, version } } });
      if (!published) throw new AppException('UNPROCESSABLE_ENTITY', `Cette version (${version}) n'est pas publiée.`);
    }

    // One upsert: seeds the singleton from the defaults on the very first write
    const updated = await this.prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      create: {
        ...DEFAULT_PLATFORM_SETTINGS,
        ...validated,
        id: 'singleton',
        updatedByUserId: actorUserId,
      },
      update: {
        ...validated,
        updatedByUserId: actorUserId,
      },
    });

    return toDto(updated);
  }

  /**
   * Fast query for platform maintenance status and banner message.
   */
  async isMaintenanceActive(): Promise<{ active: boolean; message: string }> {
    try {
      const row = await this.prisma.platformSettings.findUnique({
        where: { id: 'singleton' },
        select: {
          maintenanceEnabled: true,
          maintenanceMessage: true,
        },
      });

      return {
        active: row?.maintenanceEnabled ?? DEFAULT_PLATFORM_SETTINGS.maintenanceEnabled,
        message: row?.maintenanceMessage ?? DEFAULT_PLATFORM_SETTINGS.maintenanceMessage,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to query maintenance status, using fallback: ${(err as Error)?.message}`,
      );
      return {
        active: DEFAULT_PLATFORM_SETTINGS.maintenanceEnabled,
        message: DEFAULT_PLATFORM_SETTINGS.maintenanceMessage,
      };
    }
  }
}
