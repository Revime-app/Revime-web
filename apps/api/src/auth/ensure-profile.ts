import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Ensures exactly one Profile exists for the given user.
 * Uses upsert so retries are safe. If profile creation fails,
 * deletes the orphaned user and rethrows.
 */
export async function ensureProfileForUser(
  prisma: PrismaClient,
  user: { id: string },
): Promise<void> {
  try {
    await prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        clientEnabled: true,
        repairerEnabled: false,
        activeMode: 'CLIENT',
      },
      update: {},
    });
  } catch (error) {
    // Profile creation failed - delete the orphaned user and rethrow
    try {
      await prisma.user.delete({ where: { id: user.id } });
    } catch (deleteError) {
      // Cleanup also failed - log loudly so the orphaned account can be found
      console.error(
        `[auth] CRITICAL: Profile creation failed AND user cleanup failed for user ${user.id}. Orphaned account exists.`,
        { originalError: error, deleteError },
      );
    }
    throw error;
  }
}
