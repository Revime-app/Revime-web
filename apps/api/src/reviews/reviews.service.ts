import { Injectable } from '@nestjs/common';
import type { CreateReviewInput, ReviewDto } from '@revime/shared';
import { publicIdentity } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NOT_DEMO_REVIEW_WHERE } from './demo-review.js';

const NOT_FOUND = 'Ressource introuvable.';
const CLIENT_ONLY = 'Seul le client peut laisser un avis.';
const NOT_RELEASED = 'Vous pourrez laisser un avis lorsque les fonds auront été débloqués.';
const REFUNDED = 'Cette commande a été remboursée.';
const ALREADY_REVIEWED = 'Vous avez déjà laissé un avis pour cette commande.';
/** Verbatim from `commandes.service.ts:41`, so the two refusal paths cannot drift apart. */
const UNDER_REVIEW = "Ce paiement fait l'objet d'une vérification.";

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Design §4.3. Eligibility is `status: 'PAID'` AND `step: 'RELEASED'`, and there is
   * no feature flag anywhere in this path -- reviews are inert BY DATA, since no
   * commande can reach RELEASED while `PAYMENTS_ENABLED` is absent (§6.4). A flag in
   * front of something already unreachable buys nothing and costs a false sense of
   * protection.
   */
  async create(userId: string, commandeId: string, input: CreateReviewInput): Promise<void> {
    // Either party matches, so a réparateur gets 403 « not yours » rather than 404
    // « no such commande » -- denying a row he is genuinely a party to would be a lie.
    // A stranger still gets 404, because neither arm of the OR matches him.
    const row = await this.prisma.commande.findFirst({
      where: { id: commandeId, OR: [{ clientUserId: userId }, { repairerUserId: userId }] },
      select: {
        clientUserId: true,
        repairerUserId: true,
        status: true,
        step: true,
        disputedAt: true,
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    // Only the client reviews. A réparateur reviewing a client is absent from the
    // prototype and out of scope by §12, so this is a settled boundary rather than an
    // unfinished half.
    if (row.clientUserId !== userId) throw new AppException('FORBIDDEN', CLIENT_ONLY);

    // TWO separate conditions with TWO messages, and BOTH are load-bearing.
    //
    // `REFUNDED` is a *status* and not a step (`schema.prisma:84-89`), so a refunded row
    // can carry `step: 'RELEASED'` and satisfies the step check completely. Admitting it
    // would turn reviews into a retaliation channel attached to a refund: the client was
    // made whole and the réparateur was never paid. Checked separately rather than as one
    // `&&` so each has its own French and its own test -- one test cannot see both.
    if (row.step !== 'RELEASED') throw new AppException('UNPROCESSABLE_ENTITY', NOT_RELEASED);
    if (row.status !== 'PAID') throw new AppException('UNPROCESSABLE_ENTITY', REFUNDED);
    // THIRD condition, added by the whole-branch review, and it is not belt-and-braces.
    // `payments.service.ts` stamps `disputedAt` on any commande carrying the disputed
    // charge with NO step filter, so a RELEASED row can be under chargeback. A client who
    // has opened one is in exactly the adversarial position 4.3 refuses to serve when it
    // excludes a refunded row: without this, he could review, then charge back, then win,
    // leaving a public review counting toward a reparateur who was clawed back. It also
    // makes this route agree with `commande/[id].tsx`, whose button has always been gated
    // on `!data.paymentUnderReview` -- the UI was stricter than the API.
    if (row.disputedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', UNDER_REVIEW);
    }

    try {
      await this.prisma.review.create({
        data: {
          commandeId,
          authorUserId: userId,
          // Derived from the commande, never from the body. Zod strips unknown keys, so a
          // hostile `repairerUserId` cannot reach here either -- belt and braces, and the
          // schema's own test pins the Zod half.
          repairerUserId: row.repairerUserId,
          rating: input.rating,
          // `?? null` rather than leaving them undefined: an omitted optional and an
          // explicit null both mean « skipped », and the column has one representation.
          qualityRating: input.qualityRating ?? null,
          delayRating: input.delayRating ?? null,
          communicationRating: input.communicationRating ?? null,
          comment: input.comment ?? null,
        },
      });
    } catch (e) {
      // The duplicate is refused by `@@unique([commandeId])` rather than by a
      // check-then-insert, so two simultaneous taps cannot both win -- which is what
      // §4.3 means by "structurally impossible rather than guarded by a check".
      //
      // This arm is the ONLY thing that turns the constraint into French, and unlike
      // piece 1's soft-delete arm it is REACHABLE from the first day, so it has its own
      // test rather than a comment promising it works.
      //
      // Note it fires for a SOFT-DELETED review too, and that is verified rather than
      // assumed: `schema.prisma:730` declares a plain `@unique` and the applied SQL is
      // `CREATE UNIQUE INDEX "Review_commandeId_key" ON "Review"("commandeId")` with no
      // WHERE clause, so the index cannot see `deletedAt`.
      //
      // The consequence is a REQUIREMENT on the commande DTO rather than a fact about it
      // today: `reviewed` must report true for a soft-deleted review as well, or the
      // « Laisser un avis » button returns after an operator removes one and the next tap
      // lands here as a 422 the client discovers by pressing it.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_REVIEWED);
      }
      throw e;
    }
  }

  /**
   * The public list, design 6.1. Without it reviews are write-only, the réparateur can
   * never see what was said about him, and LaisserAvis's own promise that the review
   * will be « publié publiquement sur le profil du réparateur » is one nothing keeps.
   *
   * UNBOUNDED, and 4.4a argues it two ways. Nothing in this API paginates -- `take:`
   * occurs once in the whole hand-written source, a `take: 1` for an offer recap -- so a
   * page here would be the project's sole exception. And piece C computes its five-star
   * distribution from this whole array, so one page's distribution would be presented as
   * the réparateur's.
   *
   * A user id that does not exist answers `[]` rather than 404, deliberately: there is no
   * second query to prove the réparateur exists, the only consumer is piece C's profile
   * screen which already holds the person, and « no reviews » is the honest answer to
   * « what has anyone said about this id ».
   */
  async listForRepairer(repairerUserId: string): Promise<ReviewDto[]> {
    const rows = await this.prisma.review.findMany({
      // `deletedAt: null` is what takes an operator's soft-delete off the public list as
      // well as out of the aggregate. Note the contrast with `CommandeDto.reviewed`,
      // which must NOT filter it: removing a review hides it, but does not license a
      // second one, because the unique index cannot see `deletedAt` either.
      //
      // PRE-2: a demo review (author OR réparateur a seeded demo account) is filtered by the query,
      // not after it, so that the list and the `repairerStats` rating are cut by the same predicate.
      where: { repairerUserId, deletedAt: null, ...NOT_DEMO_REVIEW_WHERE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rating: true,
        qualityRating: true,
        delayRating: true,
        communicationRating: true,
        comment: true,
        createdAt: true,
        author: { select: { username: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      // The handle, ALWAYS, and displayName is deliberately not consulted.
      // A review author is acting as a CLIENT - a review requires a commande they
      // paid for - but they may ALSO hold a RepairerProfile, and passing their
      // trade name here would sign a client-side review « Atelier Martin », which
      // reads as a réparateur endorsing himself. Position in the interaction
      // decides the presentation; the existence of a profile row never does.
      //
      // This replaces first-name-only, which was an owner decision of 2026-08-19.
      // Superseded by the client's CF-05, not overlooked.
      authorName: publicIdentity({ username: r.author.username, displayName: null }),
      rating: r.rating,
      qualityRating: r.qualityRating,
      delayRating: r.delayRating,
      communicationRating: r.communicationRating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
