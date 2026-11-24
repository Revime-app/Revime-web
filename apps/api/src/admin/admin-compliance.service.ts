import { Injectable } from '@nestjs/common';
import {
  type AdminComplianceItem,
  type AdminComplianceListQuery,
  type AdminComplianceListResponse,
  type AdminComplianceVerifyResponse,
  verifyConsentProofChecksum,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsentProofsService } from '../compliance/consent-proofs.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class AdminComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consentProofsService: ConsentProofsService,
  ) {}

  async list(query: AdminComplianceListQuery): Promise<AdminComplianceListResponse> {
    const { limit, page } = query;
    const q = query.q?.trim();

    // The e-mail match is a relation filter, so it is ONE query and `total` counts every match.
    // (A pre-lookup capped at 50 users silently dropped the rest of a broad search.)
    const where: Prisma.ConsentProofWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(q
        ? {
            OR: [
              { userId: q },
              { commandeId: q },
              { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.consentProof.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { timestamp: 'desc' },
        // V9 B1 (`DEC9-06` (1)): the sign-up method, shown in each proof's details.
        include: { user: { select: { email: true, signupMethod: true } } },
      }),
      this.prisma.consentProof.count({ where }),
    ]);

    const items: AdminComplianceItem[] = rows.map((r) => {
      const { valid, historicalImport } = verifyConsentProofChecksum(r);
      return {
        id: r.id,
        userId: r.userId,
        userEmail: r.user.email,
        kind: r.kind,
        cguVersion: r.cguVersion,
        waiverTextVersion: r.waiverTextVersion,
        privacyVersion: r.privacyVersion,
        signupMethod: r.user.signupMethod ?? null,
        legalTextSnapshot: r.legalTextSnapshot,
        actionProof: r.actionProof,
        commandeId: r.commandeId,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        checksum: r.checksum,
        timestamp: r.timestamp.toISOString(),
        valid,
        historicalImport,
      };
    });

    return { items, total, page, totalPages: Math.ceil(total / limit) };
  }

  async verify(id: string): Promise<AdminComplianceVerifyResponse> {
    const result = await this.consentProofsService.verifyProof(id);
    if (!result) {
      throw new AppException('NOT_FOUND', 'Preuve de consentement introuvable.');
    }

    return {
      id: result.proof.id,
      valid: result.valid,
      historicalImport: result.historicalImport,
      calculatedChecksum: result.calculatedChecksum,
      storedChecksum: result.proof.checksum,
      verifiedAt: new Date().toISOString(),
    };
  }
}
