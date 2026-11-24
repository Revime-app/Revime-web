// apps/api/scripts/seed-demo/teardown.mjs
import { writeFileSync } from 'node:fs';
import { DEMO_DOMAIN, REPAIRERS, TUNED_OFFERS } from './cast.mjs';
import { PHOTO_BUCKET } from './photos.mjs';

export const OWNER_USER_ID = 'mnGr2y2QuWqxZbaA6ijUk5fl5qcD5n6W';
export const TESTR_USER_ID = 'cmHNEDhU2DY7GzPHrXRaoWfxnRtVR3oq';
export const CLIENT_USER_ID = 'v0lvQzcoWXqVNFAJqGU8e4PqE5jOFuxz';
export const CLIENT_DEMANDE_ID = '808b65fa-2a3f-4787-8886-147d96473665';

/**
 * The four conversations added to the OWNER's own inbox by hand on 2026-08-21, so he could see
 * what the messaging screen looks like with traffic in it. Deterministic ids on purpose: the
 * rows were inserted with raw SQL rather than by this script, and fixed ids are what let
 * `capturePlan` find their notification rows precisely instead of using a predicate that could
 * reach his real ones. Capture, not delete: `deletePlan` then removes them by captured id.
 *
 * The conversations, their messages and the four backing offers all cascade away on their own
 * -- from the seeded clients and from the seeded demandes. Only the notifications need naming,
 * because `Notification` carries no foreign key on `conversationId`.
 */
export const OWNER_DEMO_CONVERSATION_IDS = [
  '11110000-0000-4000-8000-000000000001',
  '11110000-0000-4000-8000-000000000002',
  '11110000-0000-4000-8000-000000000003',
  '11110000-0000-4000-8000-000000000004',
];

/**
 * Rows the seed does NOT own, so no cascade reverts them. Each carries the value to
 * restore on --cleanup.
 */
export const MUTATIONS = [
  {
    userId: TESTR_USER_ID,
    table: 'RepairerProfile',
    set: { displayName: 'Nadia Belkacem', bio: 'Réparatrice à Lyon, smartphones et petit électroménager. Devis rapide, travail soigné.' },
    restore: { displayName: 'Test R', bio: null },
    reason: 'The directory is not flag-gated, so « Test R » is on screen the moment he looks.',
  },
  {
    userId: OWNER_USER_ID,
    table: 'Profile',
    set: { verificationLevel: 'IDENTITY' },
    restore: { verificationLevel: 'BASIC' },
    reason: "Otherwise the owner's own profile is the one with no badge.",
  },
];

/**
 * Hard deletes, and hard rather than soft ON PURPOSE: a soft-deleted offer
 * resurfaces under « Offres retirées » in his UI, which is worse than leaving it.
 * One-way, hence the backup file.
 */
export const DOOMED = [
  {
    table: 'Demande',
    id: '4bd9ad94-2679-4653-87dc-8ecf31878fb8',
    reason: "« Testbsbsb », the owner's test demande. Appears in the client's reparateur feed, because the feed excludes only HIS OWN demandes.",
  },
  {
    table: 'Offer',
    id: 'c12b2f85-8f1e-4196-aa27-d64d36412248',
    reason: "The owner's 80 EUR offer on « Écran cassé ». Renders as a workshop repair 390 km away in Lyon.",
  },
];

/**
 * The display names the four tuned offers will have snapshotted onto the client's
 * OFFER_RECEIVED notifications. `offers.service.ts:139` writes
 * `repairerProfile?.displayName ?? user.name`, and Phase 1 sets the displayName, so
 * these four strings are what identifies our bell rows from anyone else's.
 */
export const SEEDED_OFFER_ACTOR_NAMES = TUNED_OFFERS.map((o) => {
  const r = REPAIRERS.find((x) => x.key === o.repairerKey);
  if (!r) {
    throw new Error(`TUNED_OFFERS names réparateur "${o.repairerKey}", which is not in REPAIRERS.`);
  }
  return r.displayName;
});

/**
 * The predicates used to FIND rows, at CAPTURE time only. 🛑 No DELETE ever uses one:
 * `deletePlan` deletes the ids `captureBackup` recorded, so a row that appears between
 * capture and delete cannot be destroyed unrecorded, and nothing has to be re-queried
 * after the query's own answer has been deleted.
 *
 * These three sets are the rows cleanup must remove by hand, because none of them is on
 * a cascade path: `Notification`'s only foreign key is `userId` and the client's account
 * is never deleted, and the photo sits on his demande, which is never deleted either.
 *
 * 🛑 The client-notification predicate is narrow ON PURPOSE, and the narrowness is what
 * survives Task 9. An earlier version matched « any notification of his with a
 * conversationId, or any on his demande », justified by a comment saying messaging was
 * off and there were zero real conversations. That argument expires the moment
 * `MESSAGING_ENABLED` is set while he is using the app: the next cleanup would take his
 * real message and offer notifications with it. So MESSAGE_RECEIVED is scoped to
 * conversations whose réparateur is one of OURS, and OFFER_RECEIVED to the four
 * display names this seed puts on screen.
 *
 * `demoConversationIds` is resolved live rather than declared: a conversation on his
 * demande is only ours if its réparateur is a `@demo.revime.fr` account.
 */
export function capturePlan({ demoConversationIds }) {
  return [
    {
      table: 'Notification',
      where: { demandeId: DOOMED[0].id },
      reason: 'Notifications pointing at the hard-deleted test demande, which they outlive as orphans.',
    },
    {
      table: 'Notification',
      where: {
        userId: CLIENT_USER_ID,
        OR: [
          { conversationId: { in: demoConversationIds } },
          {
            type: 'OFFER_RECEIVED',
            demandeId: CLIENT_DEMANDE_ID,
            actorName: { in: SEEDED_OFFER_ACTOR_NAMES },
          },
        ],
      },
      reason:
        "The seed's own bell rows on the client account: MESSAGE_RECEIVED from the two seeded threads, OFFER_RECEIVED from the four tuned offers. His own real notifications are outside both arms.",
    },
    {
      table: 'Notification',
      where: {
        userId: OWNER_USER_ID,
        conversationId: { in: OWNER_DEMO_CONVERSATION_IDS },
      },
      reason:
        "The OWNER's own bell rows from the four demo conversations hand-added to his inbox on 2026-08-21. Captured rather than deleted by predicate, because a test already enforces that every surgical Notification delete goes by a captured id -- which is the right invariant: it puts the rows in the backup before they are destroyed. Scoped by four FIXED conversation ids, so it can never reach a real notification the way a not-null predicate could.",
    },
    {
      table: 'DemandePhoto',
      where: { demandeId: CLIENT_DEMANDE_ID },
      reason: "The photo the seed put on the client's own demande. Off every cascade path, because his demande is never deleted.",
    },
  ];
}

/**
 * Every delete this script will ever issue, as data, so a test can assert on it.
 *
 * Pass the object `captureBackup` returned. The three surgical steps are then keyed on
 * the ids it recorded. Called with no argument -- which is how the tests read its
 * SHAPE -- those steps carry an empty id list and would delete nothing, which is why
 * `applyDeletes` refuses to run without a backup rather than quietly issuing a no-op.
 */
export function deletePlan(backup) {
  const captured =
    backup?.captured ??
    capturePlan({ demoConversationIds: [] }).map((s) => ({ table: s.table, reason: s.reason, ids: [] }));

  return [
    {
      table: 'user',
      where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
      reason: 'The whole demo population. All 21 User foreign keys cascade.',
    },
    ...captured.map((c) => ({
      table: c.table,
      where: { id: { in: c.ids } },
      reason: `${c.reason} Deleted by the ${c.ids.length} id(s) captureBackup recorded.`,
    })),
    ...DOOMED.map((d) => ({ table: d.table, where: { id: d.id }, reason: d.reason })),
  ];
}

/**
 * Captures everything about to be destroyed or mutated. Called BEFORE restoreMutations
 * and deletes, so it records the live production state.
 *
 * 🛑 It also captures the IDENTITY of what will be deleted -- the ids for the three
 * surgical steps, and the storage paths of every object about to lose its row -- and not
 * merely a copy of the contents. That is the whole ordering fix: `deleteStorageObjects`
 * used to find its paths by querying the `DemandePhoto` rows `applyDeletes` had just
 * removed, so it always found zero and logged « no storage objects to delete ». Every
 * uploaded object survived cleanup and the message read like success.
 */
export async function captureBackup(prisma, { log }) {
  const backup = {
    takenAt: new Date().toISOString(),
    doomed: [],
    demandeCascade: {},
    offerCascade: {},
    captured: [],
    photos: [],
    storagePaths: [],
    mutationsLive: [],
    mutationsStatic: MUTATIONS,
  };

  // Capture doomed parent rows and their cascade children
  for (const d of DOOMED) {
    const row = await prisma[d.table === 'user' ? 'user' : lower(d.table)].findUnique({ where: { id: d.id } });
    if (!row) {
      log(`WARNING: DOOMED ${d.table} ${d.id} not found — may be a mistyped id`);
    }
    backup.doomed.push({ table: d.table, id: d.id, row });

    // If it's a demande, capture its cascade children
    if (d.table === 'Demande' && row) {
      const offers = await prisma.offer.findMany({ where: { demandeId: d.id } });
      const commandes = await prisma.commande.findMany({ where: { demandeId: d.id } });
      const conversations = await prisma.conversation.findMany({ where: { demandeId: d.id } });
      const conversationIds = conversations.map((c) => c.id);
      const messages =
        conversationIds.length > 0
          ? await prisma.message.findMany({ where: { conversationId: { in: conversationIds } } })
          : [];
      const photos = await prisma.demandePhoto.findMany({ where: { demandeId: d.id } });
      backup.demandeCascade[d.id] = { offers, commandes, conversations, messages, photos };
    }

    // If it's an offer, capture its cascade children (Commande cascades from Offer, Review cascades from Commande)
    if (d.table === 'Offer' && row) {
      const commandes = await prisma.commande.findMany({ where: { offerId: d.id } });
      const commandeIds = commandes.map((c) => c.id);
      const reviews =
        commandeIds.length > 0
          ? await prisma.review.findMany({ where: { commandeId: { in: commandeIds } } })
          : [];
      backup.offerCascade[d.id] = { commandes, reviews };
    }
  }

  // Which accounts are ours, and therefore which conversations on the client's demande
  // are ours. Read once and reused by the capture predicates and the storage sweep.
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);
  const demoConversations = await prisma.conversation.findMany({
    where: { demandeId: CLIENT_DEMANDE_ID, repairerUserId: { in: demoUserIds } },
    select: { id: true },
  });
  const demoConversationIds = demoConversations.map((c) => c.id);

  // Capture, by id, every row the three surgical delete steps will remove.
  for (const step of capturePlan({ demoConversationIds })) {
    const rows = await prisma[lower(step.table)].findMany({ where: step.where });
    backup.captured.push({
      table: step.table,
      reason: step.reason,
      ids: rows.map((r) => r.id),
      rows,
    });
    log(`captured ${rows.length} ${step.table} row(s) to delete by id (${step.reason})`);
  }

  /**
   * Storage paths, captured while the rows that name them still exist. Deleting a
   * `DemandePhoto` row does not delete the object -- storage sits outside Postgres, so
   * no foreign key will ever reach it -- and once the row is gone the path is
   * unrecoverable. The doomed demande is included because its hard delete cascades its
   * photo rows away too.
   */
  const seededDemandes = await prisma.demande.findMany({
    where: { authorUserId: { in: demoUserIds } },
    select: { id: true },
  });
  const photoDemandeIds = [
    ...seededDemandes.map((d) => d.id),
    ...DOOMED.filter((d) => d.table === 'Demande').map((d) => d.id),
    CLIENT_DEMANDE_ID,
  ];
  backup.photos = await prisma.demandePhoto.findMany({
    where: { demandeId: { in: photoDemandeIds } },
    select: { id: true, demandeId: true, storagePath: true, sortOrder: true },
  });
  backup.storagePaths = backup.photos.map((p) => p.storagePath);
  log(`captured ${backup.storagePaths.length} storage path(s) before their rows are deleted`);

  // Capture LIVE values of mutated rows before we overwrite them
  for (const m of MUTATIONS) {
    if (m.table === 'RepairerProfile') {
      const live = await prisma.repairerProfile.findUnique({ where: { userId: m.userId } });
      backup.mutationsLive.push({ table: m.table, userId: m.userId, live });
    } else if (m.table === 'Profile') {
      const live = await prisma.profile.findUnique({ where: { userId: m.userId } });
      backup.mutationsLive.push({ table: m.table, userId: m.userId, live });
    }
  }

  return backup;
}

export function writeBackup(backup, backupPath) {
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
}

export async function applyDeletes(prisma, { backup, log }) {
  if (!backup?.captured) {
    throw new Error(
      'applyDeletes needs the object captureBackup returned: the three surgical steps delete by captured id, and without it they would delete nothing while reporting success.',
    );
  }

  for (const step of deletePlan(backup)) {
    const model = step.table === 'user' ? 'user' : lower(step.table);
    const { count } = await prisma[model].deleteMany({ where: step.where });
    log(`deleted ${count} from ${step.table} (${step.reason})`);
  }
}

/**
 * Deletes the bucket objects whose paths `captureBackup` recorded.
 *
 * 🛑 It consumes the capture and does NOT re-query. Deleting a `DemandePhoto` row does
 * not delete the object, and by the time this runs those rows are gone -- so a query
 * here can only ever answer zero, which is exactly what the previous version did while
 * logging « no storage objects to delete ».
 */
export async function deleteStorageObjects(backup, { supabaseUrl, serviceRoleKey, log }) {
  if (!backup?.storagePaths) {
    throw new Error(
      'deleteStorageObjects needs the object captureBackup returned: the DemandePhoto rows naming these paths are already deleted by this point, so the paths cannot be recovered from the database.',
    );
  }

  const paths = backup.storagePaths;
  if (paths.length === 0) {
    log('no storage objects to delete (none were captured, so there were none to begin with)');
    return;
  }

  const base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1`;
  const res = await fetch(`${base}/object/${PHOTO_BUCKET}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prefixes: paths }),
  });

  if (!res.ok) {
    throw new Error(`storage delete -> ${res.status} ${await res.text()}`);
  }

  log(`deleted ${paths.length} storage objects`);
}

function lower(table) {
  return table.charAt(0).toLowerCase() + table.slice(1);
}
