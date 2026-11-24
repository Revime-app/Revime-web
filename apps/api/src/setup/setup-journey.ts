import {
  repairerJourney,
  repairerProfileCompletion,
  type RepairerJourney,
  type RepairerJourneyInput,
} from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { isConnectEnabled } from '../connect/config.js';

/**
 * V8 E1. The server's twin of the app's `useRepairerJourney`: the same `repairerJourney` inputs, read in ONE query
 * for many repairers, so the setup reminders and the admin count agree with the card the repairer sees.
 *
 * Mapped exactly as the app maps its three responses (`GET /me`, `/identity/status`, `/connect/status`), with one
 * accepted difference: the photo item reads the stored `avatarPath`, where the app reads the SIGNED url, which is
 * null when the object behind the path is gone. That only differs for a broken upload.
 */
export const JOURNEY_SELECT = {
  userId: true,
  kind: true,
  createdAt: true,
  lat: true,
  lng: true,
  bannerPath: true,
  bio: true,
  postalCode: true,
  fiscalCompletedAt: true,
  setupReminder3dAt: true,
  setupReminder8dAt: true,
  user: {
    select: {
      image: true,
      profile: { select: { verificationLevel: true, avatarPath: true } },
      identityVerification: { select: { status: true, lastErrorCode: true, decision: true } },
      connectAccount: { select: { status: true } },
      businessVerification: { select: { status: true } },
      repairerCategories: { select: { categoryId: true } },
      repairerAvailability: { select: { dayOfWeek: true } },
    },
  },
} satisfies Prisma.RepairerProfileSelect;

export type JourneyRow = Prisma.RepairerProfileGetPayload<{ select: typeof JOURNEY_SELECT }>;

export type LoadedJourney = {
  id: string;
  userId: string;
  createdAt: Date;
  lat: number | null;
  lng: number | null;
  setupReminder3dAt: Date | null;
  setupReminder8dAt: Date | null;
  journey: RepairerJourney;
};

export function journeyInputFromRow(row: JourneyRow, connectEnabled: boolean): RepairerJourneyInput {
  const identity = row.user.identityVerification;
  // As `IdentityService.status()`: an ACCEPTED decision is reported as null (he simply reads « validée »).
  const decision =
    identity?.decision === 'REFUSED' || identity?.decision === 'DOCUMENTS_REQUESTED' ? identity.decision : null;
  return {
    kind: row.kind,
    level: row.user.profile?.verificationLevel ?? 'NONE',
    identityStatus: identity?.status ?? null,
    lastErrorCode: identity?.lastErrorCode ?? null,
    completion: repairerProfileCompletion({
      avatarUrl: row.user.profile?.avatarPath ?? null,
      image: row.user.image,
      bannerUrl: row.bannerPath,
      bio: row.bio,
      categoryIds: row.user.repairerCategories.map((c) => c.categoryId),
      postalCode: row.postalCode,
      availabilityDays: row.user.repairerAvailability.length,
    }),
    connectStatus: row.user.connectAccount?.status ?? null,
    connectEnabled,
    decision,
    decisionReason: null,
    fiscalCompleted: row.fiscalCompletedAt !== null,
    businessStatus: row.user.businessVerification?.status ?? null,
  };
}

export async function loadRepairerJourneys(
  prisma: PrismaService,
  where: Prisma.RepairerProfileWhereInput,
): Promise<LoadedJourney[]> {
  const rows = await prisma.repairerProfile.findMany({ where, select: { id: true, ...JOURNEY_SELECT } });
  const connectEnabled = isConnectEnabled();
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    lat: row.lat,
    lng: row.lng,
    setupReminder3dAt: row.setupReminder3dAt,
    setupReminder8dAt: row.setupReminder8dAt,
    journey: repairerJourney(journeyInputFromRow(row, connectEnabled)),
  }));
}
