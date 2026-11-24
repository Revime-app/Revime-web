/**
 * PUB-33 (DECP-23). The store-review seal (`src/review-accounts/review-account.ts`) reads the viewer's
 * e-mail through `prisma.user.findUnique` / `findMany`. Hand-built fake Prismas that predate the seal
 * have no `user` lookups; this fills in only the missing ones, answering « no such user », which the
 * seal reads as a real account. So a harness keeps meaning exactly what it meant before.
 *
 * Test-only, by design: production code does not tolerate a missing table.
 */
export function withUserLookups<T>(prisma: T): T {
  const p = prisma as unknown as { user?: Record<string, unknown> };
  p.user ??= {};
  p.user.findUnique ??= async () => null;
  p.user.findMany ??= async () => [];
  return prisma;
}
