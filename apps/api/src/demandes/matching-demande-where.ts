import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { matchingCategoryIds } from '../repairers/speciality-match.js';
import { PUBLIC_DEMANDE_WHERE } from './demande-predicates.js';

/**
 * CF4-26 (sub-project G, spec §4.3 / §4.4, decisions G1-G2, G8). The demandes that
 * « correspondent à vos services »: OPEN, visible, not his own, in a category his
 * declaration covers, and carrying no LIVE offer from him.
 *
 * ONE builder for both the dashboard count and the feed « Pour moi » list, so the number
 * on the line and the list its link opens cannot disagree.
 *
 * `deletedAt: null` inside `offers.none` is load-bearing: a withdrawn (soft-deleted) offer
 * must make the demande count again, since he can offer on it anew.
 *
 * API-local rather than in `packages/shared`: it returns a Prisma type.
 */
export function matchingDemandeWhere(
  userId: string,
  categoryIds: readonly string[],
): Prisma.DemandeWhereInput {
  return {
    status: 'OPEN',
    // CF4-25: public only - a private request is never « for » anyone but its target, who
    // reaches it through « Demandes de devis », not through matching.
    ...PUBLIC_DEMANDE_WHERE,
    authorUserId: { not: userId },
    categoryId: { in: [...categoryIds] },
    offers: { none: { repairerUserId: userId, deletedAt: null } },
  };
}

/**
 * His declared categories expanded over the active tree. `[]` means he has declared none
 * (CATEGORIES_MISSING / an empty « Pour moi » list), and then the tree is not read.
 *
 * `PrismaService` is a type-only import here on purpose: this is a plain function taking
 * the client as an argument, not an injected class, so the Nest DI rule does not apply.
 */
export async function loadMatchingCategoryIds(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  const declared = await prisma.repairerCategory.findMany({
    where: { repairerUserId: userId },
    select: { categoryId: true },
  });
  if (declared.length === 0) return [];
  const tree = await prisma.category.findMany({
    where: { active: true },
    select: { id: true, parentId: true },
  });
  return matchingCategoryIds(
    declared.map((d) => d.categoryId),
    tree,
  );
}
