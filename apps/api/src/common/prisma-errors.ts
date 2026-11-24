/**
 * Prisma's unique-constraint code. Extracted from three byte-identical copies in
 * `connect/`, `identity/` and `payments/` when P3 added a fourth module needing it.
 *
 * Deliberately does NOT inspect `meta.target`: every current caller has exactly
 * one unique constraint in play. A caller with two must check the target itself.
 */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
  );
}
