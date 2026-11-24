import { CURRENT_PRIVACY_VERSION } from '@revime/shared';

type SettingsReader = { platformSettings: { findUnique(args: unknown): Promise<unknown> } };

/**
 * V9 B1 (`DEC9-05` (1)): the privacy-policy version sign-up and the terms screen stamp. A server
 * setting like the CGU's, bumped by us when the compiled text changes; no dashboard publishing yet.
 * Falls back to the version the app ships when no settings row exists.
 */
export async function activePrivacyVersion(prisma: SettingsReader): Promise<string> {
  const settings = (await prisma.platformSettings.findUnique({
    where: { id: 'singleton' },
    select: { privacyCurrentVersion: true },
  })) as { privacyCurrentVersion?: string } | null;
  return settings?.privacyCurrentVersion ?? CURRENT_PRIVACY_VERSION;
}
