import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  formatLegalForm,
  isLuhnValid,
  normaliseCompanyIdentifier,
  type BusinessStatusResponse,
  type LookupCompanyResponse,
  type SignDocumentUploadInput,
  type SubmitBusinessVerificationInput,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { storageGateway } from '../storage/gateway.js';
import { businessDocumentBucket } from './document-bucket.js';
import { registryGateway } from './gateway.js';

const IDENTITY_FIRST = 'Vérifiez votre identité avant de vérifier votre entreprise.';

/**
 * The levels from which business verification is reachable.
 *
 * BUSINESS is included so a réparateur who needs to update or correct documents can re-submit.
 */
const MAY_VERIFY = new Set(['IDENTITY', 'BUSINESS']);

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mints a signed upload URL for a business verification document (KBIS, insurance, etc.).
   */
  async signDocumentUpload(
    userId: string,
    input: SignDocumentUploadInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { verificationLevel: true },
    });
    if (!profile || !MAY_VERIFY.has(profile.verificationLevel)) {
      throw new AppException('FORBIDDEN', IDENTITY_FIRST);
    }

    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedMimes.includes(input.mimeType)) {
      throw new AppException('VALIDATION_FAILED', 'Format de fichier non supporté (PDF, JPEG, PNG uniquement).');
    }

    if (input.sizeBytes > 10 * 1024 * 1024) {
      throw new AppException('VALIDATION_FAILED', 'Le fichier ne doit pas dépasser 10 Mo.');
    }

    const cleanName =
      input.filename
        .split(/[/\\]/)
        .pop()
        ?.trim()
        .replace(/[^a-zA-Z0-9._-]/g, '_') || 'document.pdf';

    const path = `business-documents/${userId}/${randomUUID()}-${cleanName}`;
    const { uploadUrl } = await storageGateway().createSignedUpload(
      path,
      input.mimeType,
      businessDocumentBucket(),
    );

    return { path, uploadUrl };
  }

  /**
   * Assistive public SIRENE registry lookup.
   * Returns public company details or { found: false } without throwing or modifying database.
   */
  async lookup(identifier: string): Promise<LookupCompanyResponse> {
    const digits = normaliseCompanyIdentifier(identifier);
    if ((digits.length !== 9 && digits.length !== 14) || !isLuhnValid(digits.slice(0, 9))) {
      return { found: false };
    }
    const siren = digits.slice(0, 9);
    const siret = digits.length === 14 ? digits : null;

    try {
      const company = await registryGateway().lookup({ siren, siret });
      if (!company || company.etatAdministratif !== 'A') {
        return { found: false };
      }
      return {
        found: true,
        company: {
          siren: company.siren,
          siret: company.siret,
          denomination: company.denomination,
          legalForm: company.legalFormCode ? formatLegalForm(company.legalFormCode) : null,
          address: company.establishmentAddress,
        },
      };
    } catch {
      return { found: false };
    }
  }

  /**
   * Submits business verification details and documents for admin review.
   * Locks dirigeantName to verified identity and transitions status to PENDING.
   * Re-verification by a BUSINESS profile temporarily resets level to IDENTITY.
   */
  async submit(
    userId: string,
    input: SubmitBusinessVerificationInput,
    _ip?: string,
  ): Promise<BusinessStatusResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        name: true,
        profile: { select: { verificationLevel: true } },
      },
    });

    if (!user?.profile || !MAY_VERIFY.has(user.profile.verificationLevel)) {
      throw new AppException('FORBIDDEN', IDENTITY_FIRST);
    }

    const verifiedIdentityName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const dirigeantName = verifiedIdentityName.length > 0 ? verifiedIdentityName : user.name;

    const siren = input.identifier.slice(0, 9);
    const siret = input.identifier.length === 14 ? input.identifier : null;

    const data = {
      status: 'PENDING' as const,
      siren,
      siret,
      denomination: input.denomination.trim(),
      legalForm: input.legalForm.trim(),
      establishmentAddress: input.establishmentAddress.trim(),
      vatNumber: input.vatNumber?.trim() || null,
      dirigeantName,
      registrationProofPath: input.registrationProof.path,
      registrationProofName: input.registrationProof.name,
      registrationProofSizeBytes: input.registrationProof.sizeBytes,
      insuranceProofPath: input.insuranceProof?.path || null,
      insuranceProofName: input.insuranceProof?.name || null,
      insuranceProofSizeBytes: input.insuranceProof?.sizeBytes || null,
      submittedAt: new Date(),
      decisionMotif: null,
      decisionNote: null,
      decidedAt: null,
      decidedByUserId: null,
    };

    await this.prisma.businessVerification.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    if (user.profile.verificationLevel === 'BUSINESS') {
      await this.prisma.profile.update({
        where: { userId },
        data: { verificationLevel: 'IDENTITY' },
      });
    }

    return this.status(userId);
  }

  /**
   * The stored business verification status and company details.
   */
  async status(userId: string): Promise<BusinessStatusResponse> {
    const row = await this.prisma.businessVerification.findUnique({ where: { userId } });
    if (!row) {
      return {
        verified: false,
        status: null,
        canEdit: true,
        company: null,
        decision: null,
      };
    }

    return {
      verified: row.status === 'APPROVED',
      status: row.status,
      canEdit: row.status === 'REJECTED' || row.status === 'DOCUMENTS_REQUIRED',
      company: {
        siren: row.siren,
        siret: row.siret,
        denomination: row.denomination ?? '',
        legalForm: row.legalForm ? formatLegalForm(row.legalForm) : '',
        establishmentAddress: row.establishmentAddress ?? '',
        vatNumber: row.vatNumber ?? null,
        dirigeantName: row.dirigeantName ?? '',
        registrationProofName: row.registrationProofName ?? '',
        insuranceProofName: row.insuranceProofName ?? null,
        submittedAt: row.submittedAt.toISOString(),
        verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      },
      decision:
        row.decisionMotif && row.decidedAt
          ? {
              motif: row.decisionMotif,
              note: row.decisionNote,
              decidedAt: row.decidedAt.toISOString(),
            }
          : null,
    };
  }
}
