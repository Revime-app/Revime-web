import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  computeConsentChecksum,
  createConsentProofInputSchema,
  verifyConsentProofChecksum,
  type CreateConsentProofInput,
} from '@revime/shared';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class ConsentProofsService {
  private readonly logger = new Logger(ConsentProofsService.name);

  // `Pick`: the service only touches `consentProof`, which lets the sign-up hook (a plain
  // PrismaClient, outside Nest's container) construct it. The explicit token is needed because a
  // `Pick` type erases to `Object` in the emitted decorator metadata.
  constructor(@Inject(PrismaService) private readonly prisma: Pick<PrismaService, 'consentProof'>) {}

  async recordProof(rawInput: CreateConsentProofInput, tx?: Prisma.TransactionClient) {
    const input = createConsentProofInputSchema.parse(rawInput);
    const client = tx ?? this.prisma;
    const timestamp = input.timestamp instanceof Date
      ? input.timestamp
      : input.timestamp
        ? new Date(input.timestamp)
        : new Date();

    const checksum = computeConsentChecksum({
      userId: input.userId,
      kind: input.kind,
      timestamp,
      actionProof: input.actionProof,
      legalTextSnapshot: input.legalTextSnapshot,
      commandeId: input.commandeId,
      cguVersion: input.cguVersion,
      waiverTextVersion: input.waiverTextVersion,
      privacyVersion: input.privacyVersion,
    });

    return client.consentProof.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        cguVersion: input.cguVersion ?? null,
        waiverTextVersion: input.waiverTextVersion ?? null,
        privacyVersion: input.privacyVersion ?? null,
        legalTextSnapshot: input.legalTextSnapshot,
        actionProof: input.actionProof,
        commandeId: input.commandeId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonObject) : Prisma.DbNull,
        checksum,
        timestamp,
      },
    });
  }

  /** One read, and the whole verdict: the admin viewer needs the proof, the verdict and the hash. */
  async verifyProof(id: string) {
    const proof = await this.prisma.consentProof.findUnique({ where: { id } });
    if (!proof) return null;

    const verdict = verifyConsentProofChecksum(proof);
    if (!verdict.valid) {
      this.logger.warn(`[ComplianceAudit] Tamper detected for proof ${id} (userId: ${proof.userId})`);
    }
    return { ...verdict, proof };
  }
}
