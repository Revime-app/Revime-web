// apps/api/scripts/seed-demo/phase2-prisma.mjs

const categoryCache = new Map();

/**
 * Cached lookup on Category.slug returning the row's id. Used by Phase 1 (which is
 * injected this function) and by the orchestrator to resolve the categoryId parameter.
 */
export async function resolveCategoryId(prisma, slug) {
  if (categoryCache.has(slug)) {
    return categoryCache.get(slug);
  }

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) {
    throw new Error(
      `Category slug "${slug}" not found. Check the slug is spelled correctly and exists in the database.`,
    );
  }

  categoryCache.set(slug, category.id);
  return category.id;
}

/**
 * The order in which tables are inserted. Satisfies FK dependencies:
 * demandes before offers, offers before commandes, commandes before reviews,
 * conversations before messages, demandes before photos. This is the single source of truth for the
 * transaction array built by applyPhase2.
 */
export const INSERT_ORDER = [
  'Demande',
  'DemandePhoto',
  'Offer',
  'Commande',
  'Review',
  'Conversation',
  'Message',
  'Notification',
];

/**
 * Applies the planned rows through Prisma in dependency order. Uses createMany per
 * table in a single transaction array (eight statements instead of ~150 sequential
 * creates), with no interactive-transaction timeout exposure.
 */
export async function applyPhase2(prisma, { history, threads, backdate, mutations, photos, log }) {
  // Map of table names to their data sources
  const dataByTable = {
    Demande: history.demandes,
    DemandePhoto: photos ?? [],
    Offer: history.offers,
    Commande: history.commandes,
    Review: history.reviews,
    Conversation: threads.conversations,
    Message: threads.messages,
    Notification: threads.notifications,
  };

  // Build transaction array from INSERT_ORDER (single source of truth)
  const inserts = INSERT_ORDER.map((table) => {
    const model = table.charAt(0).toLowerCase() + table.slice(1);
    return prisma[model].createMany({ data: dataByTable[table] });
  });

  const backdateUpdates = backdate.map((b) =>
    prisma.offer.update({ where: { id: b.id }, data: { createdAt: b.createdAt } }),
  );

  const mutationUpdates = mutations
    .map((m) => {
      if (m.table === 'RepairerProfile') {
        return prisma.repairerProfile.update({ where: { userId: m.userId }, data: m.set });
      } else if (m.table === 'Profile') {
        return prisma.profile.update({ where: { userId: m.userId }, data: m.set });
      } else {
        throw new Error(`Unknown mutation table: ${m.table}`);
      }
    });

  await prisma.$transaction([...inserts, ...backdateUpdates, ...mutationUpdates]);

  log(`created ${history.demandes.length} demandes`);
  if (photos && photos.length > 0) log(`created ${photos.length} demande photos`);
  log(`created ${history.offers.length} offers`);
  log(`created ${history.commandes.length} commandes`);
  log(`created ${history.reviews.length} reviews`);
  log(`created ${threads.conversations.length} conversations`);
  log(`created ${threads.messages.length} messages`);
  log(`created ${threads.notifications.length} notifications`);
  log(`backdated ${backdate.length} offers`);
  for (const m of mutations) {
    log(`mutated ${m.table} for user ${m.userId}: ${m.reason}`);
  }
}

/**
 * Restores the pre-existing rows mutated during seed, so cleanup can undo mutations
 * exactly as they were.
 */
export async function restoreMutations(prisma, { mutations, log }) {
  for (const m of mutations) {
    if (m.table === 'RepairerProfile') {
      await prisma.repairerProfile.update({ where: { userId: m.userId }, data: m.restore });
    } else if (m.table === 'Profile') {
      await prisma.profile.update({ where: { userId: m.userId }, data: m.restore });
    }
    log(`restored ${m.table} for user ${m.userId}`);
  }
}
