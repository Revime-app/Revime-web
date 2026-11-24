import { Injectable } from '@nestjs/common';
import type { BlockStateDto, CreateBlockInput, ReportConversationInput } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertSameSide } from '../review-accounts/review-account.js';

/** Matches `conversations.service.ts`'s constant. A 404 rather than a 403 everywhere. */
const NOT_FOUND = 'Ressource introuvable.';

const ALREADY_REPORTED = 'Votre signalement a déjà été transmis.';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * NOT gated on `MESSAGING_ENABLED`, and that is spec §8.1a rather than an
   * omission. A kill switch for a feature must not also be a kill switch for its
   * safety valve: if the flag is ever switched off BECAUSE of abuse, gating this
   * would take away the report path at the one moment it matters. It is inert by
   * data anyway, since a report needs a conversation and none can be opened with the
   * flag off.
   *
   * `reportedUserId` is derived from which side the caller is on, never read from the
   * body. It is denormalised so the admin queue needs no derivation of "the other
   * party" (spec §5).
   */
  async report(
    userId: string,
    conversationId: string,
    input: ReportConversationInput,
  ): Promise<void> {
    const row = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        deletedAt: null,
        OR: [{ clientUserId: userId }, { repairerUserId: userId }],
      },
      select: { id: true, clientUserId: true, repairerUserId: true },
    });
    // A 404 rather than a 403: confirming a conversation exists between two other
    // people is itself a disclosure. Same rule as `assertParticipant`.
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    const reportedUserId = row.clientUserId === userId ? row.repairerUserId : row.clientUserId;

    // One OPEN report per reporter per conversation. There is deliberately no unique
    // index for this -- piece 2 adds no DDL -- so this is a check-then-insert with a
    // real race: two simultaneous taps can both pass and insert two rows. The
    // consequence is a duplicate line in the operator's queue, which is why it is
    // bounded here rather than left unbounded, and why it is NOT dressed up as a
    // guarantee. Scoped to `resolvedAt: null` on purpose: once an operator has dealt
    // with a report, a fresh incident deserves a fresh report.
    const open = await this.prisma.conversationReport.findFirst({
      where: { conversationId: row.id, reporterUserId: userId, resolvedAt: null },
      select: { id: true },
    });
    if (open) throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REPORTED);

    await this.prisma.conversationReport.create({
      data: {
        conversationId: row.id,
        reporterUserId: userId,
        reportedUserId,
        reason: input.reason,
      },
    });
  }

  /**
   * A block is the USER'S own decision and is immediate. Report and block are
   * separate and neither implies the other (spec §8): a user being harassed must not
   * have to wait for moderation to make it stop.
   *
   * **Precondition rather than a flag (spec §8.1a): the caller must share at least
   * one conversation with the target**, soft-deleted or not. Three things it buys.
   * It makes the route's reachability match its only affordance, since the button
   * exists nowhere but inside a thread. It BOUNDS the write - without it any
   * authenticated account could insert a row against every other user, and the unique
   * index bounds only the pair, not the count. And it is what makes "inert by data
   * with the flag off" true rather than merely plausible.
   *
   * The accepted cost: nobody can pre-emptively block a stranger. No surface offers
   * that, and adding one needs a user search this project does not have until piece C.
   *
   * A block does NOT affect offers, and that is a stated V1 limitation rather than an
   * oversight (spec §8). Only the text channel closes.
   */
  async block(userId: string, input: CreateBlockInput): Promise<void> {
    // Self-block folded into the same 404 rather than given its own message: it can
    // only arrive from a hand-made body, and the shared-conversation query below
    // would answer nothing for it anyway, since `getOrCreate` refuses a conversation
    // whose two parties are one person.
    if (input.userId === userId) throw new AppException('NOT_FOUND', NOT_FOUND);
    // PUB-33 (DECP-23): across the store-review seal the other account does not exist (404).
    await assertSameSide(this.prisma, userId, input.userId);

    const shared = await this.prisma.conversation.findFirst({
      // NO `deletedAt` filter, deliberately: an operator closing the channel must not
      // strip the victim's ability to block the person who was in it.
      where: {
        OR: [
          { clientUserId: userId, repairerUserId: input.userId },
          { clientUserId: input.userId, repairerUserId: userId },
        ],
      },
      select: { id: true },
    });
    if (!shared) throw new AppException('NOT_FOUND', NOT_FOUND);

    await this.prisma.block
      .create({ data: { blockerUserId: userId, blockedUserId: input.userId } })
      .catch((e: unknown) => {
        // Idempotent by contract. The unique index is `[blockerUserId, blockedUserId]`
        // and it is NOT partial, so a double tap raises P2002 - and a user asking for
        // a state he already has must not be shown an error. Anything else rethrows.
        if (!isUniqueViolation(e)) throw e;
      });
  }

  /**
   * Carries NO shared-conversation precondition, unlike `block` (spec §8.1a).
   * Unblocking must stay possible after the shared conversation is closed, or a user
   * is stuck with a block he cannot lift.
   *
   * `deleteMany` rather than `delete`: idempotent, so a retry is not an error, and it
   * needs no prior read. It also cannot delete anyone else's block, because
   * `blockerUserId` is the session's own id.
   */
  async unblock(userId: string, targetUserId: string): Promise<void> {
    await this.prisma.block.deleteMany({
      where: { blockerUserId: userId, blockedUserId: targetUserId },
    });
  }

  /**
   * One query answering both halves of `BlockStateDto`. `active` is true when EITHER
   * party blocked the other, because spec §8 refuses new messages in BOTH directions:
   * a channel one party has closed is closed.
   *
   * `byMe` is what lets the composer offer « Débloquer » to the blocker and a neutral
   * sentence to the blocked party. See `BlockStateDto`'s own comment for why the two
   * differ.
   */
  async blockStateFor(userId: string, otherUserId: string): Promise<BlockStateDto> {
    const rows = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerUserId: userId, blockedUserId: otherUserId },
          { blockerUserId: otherUserId, blockedUserId: userId },
        ],
      },
      select: { blockerUserId: true },
    });
    return {
      active: rows.length > 0,
      byMe: rows.some((r) => r.blockerUserId === userId),
    };
  }
}
