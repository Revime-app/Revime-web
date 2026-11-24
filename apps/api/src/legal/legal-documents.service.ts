import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CANONICAL_CGU_ACCEPTANCE_TEXT,
  CANONICAL_PRIVACY_ACCEPTANCE_TEXT,
  DEFAULT_PLATFORM_SETTINGS,
  LEGAL_DOCUMENT_MAX_BYTES,
  legalDocumentKindFromSlug,
  legalDocumentSlug,
  legalDocumentStoragePath,
  type AdminLegalVersionsResponse,
  type LegalDocumentKind,
  type LegalDocumentVersionDto,
  type PublishLegalVersionInput,
  type SignLegalUploadInput,
  type SignLegalUploadResponse,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { ConsentProofsService } from '../compliance/consent-proofs.service.js';
import { activePrivacyVersion } from './privacy-version.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { storageGateway, type StorageGateway } from '../storage/gateway.js';

/** V7 D5 (U9b, `DEC7-24`). Private; every read goes through a URL the API signs. */
export const LEGAL_DOCUMENT_BUCKET = 'legal-documents';
export const LEGAL_STORAGE = 'LEGAL_STORAGE';
const READ_URL_TTL_SECONDS = 3600;

type Row = {
  id: string;
  kind: LegalDocumentKind;
  version: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  summary: string | null;
  publishedAt: Date;
  publishedByUserId: string | null;
};

function toDto(r: Row): LegalDocumentVersionDto {
  return {
    id: r.id,
    kind: r.kind,
    version: r.version,
    fileName: r.fileName,
    sizeBytes: r.sizeBytes,
    sha256: r.sha256,
    summary: r.summary,
    publishedAt: r.publishedAt.toISOString(),
    publishedByUserId: r.publishedByUserId,
  };
}

type SettingsReader = { platformSettings: { findUnique(args: unknown): Promise<unknown> } };

/**
 * The CGU version sign-up stamps on a new account and its consent proof, and that a forced
 * re-acceptance asks for: the dashboard's active version, the one source (`FND7-027`). The default
 * when no settings row exists is the version the app ships.
 */
export async function activeCguVersion(prisma: SettingsReader): Promise<string> {
  const settings = (await prisma.platformSettings.findUnique({
    where: { id: 'singleton' },
    select: { cguCurrentVersion: true },
  })) as { cguCurrentVersion?: string } | null;
  return settings?.cguCurrentVersion ?? DEFAULT_PLATFORM_SETTINGS.cguCurrentVersion;
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const v = headers[name];
  return typeof v === 'string' && v.length > 0 ? v : Array.isArray(v) ? (v[0] ?? null) : null;
}

/**
 * V7 D5 (U9b, `DEC7-24` / `DEC7-25`). Published versions of the CGU and the mentions légales: the
 * dashboard signs an upload, PUTs the client's PDF, then publishes, and the API reads the bytes back
 * to check it is a PDF and record its size and SHA-256. A version is never replaced. Also the user's
 * re-acceptance, which writes a `CGU_ACCEPTANCE` proof.
 */
@Injectable()
export class LegalDocumentsService {
  private readonly storage: StorageGateway;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LEGAL_STORAGE) storage?: StorageGateway,
  ) {
    this.storage = storage ?? storageGateway();
  }

  async list(): Promise<AdminLegalVersionsResponse> {
    const rows = (await this.prisma.legalDocumentVersion.findMany({
      orderBy: [{ version: 'desc' }],
    })) as Row[];
    return {
      cgu: rows.filter((r) => r.kind === 'CGU').map(toDto),
      mentionsLegales: rows.filter((r) => r.kind === 'MENTIONS_LEGALES').map(toDto),
    };
  }

  private async find(kind: LegalDocumentKind, version: string): Promise<Row | null> {
    return (await this.prisma.legalDocumentVersion.findUnique({ where: { kind_version: { kind, version } } })) as Row | null;
  }

  private async refuseExisting(kind: LegalDocumentKind, version: string): Promise<void> {
    if (await this.find(kind, version)) {
      throw new AppException('CONFLICT', 'Cette version est déjà publiée : une version publiée ne se remplace pas.');
    }
  }

  async signUpload(input: SignLegalUploadInput): Promise<SignLegalUploadResponse> {
    await this.refuseExisting(input.kind, input.version);
    const path = legalDocumentStoragePath(input.kind, input.version);
    return this.storage.createSignedUpload(path, 'application/pdf', LEGAL_DOCUMENT_BUCKET);
  }

  async publish(input: PublishLegalVersionInput, userId: string): Promise<LegalDocumentVersionDto> {
    await this.refuseExisting(input.kind, input.version);
    const bytes = await this.storage.getObject(LEGAL_DOCUMENT_BUCKET, input.path);
    if (!bytes) throw new AppException('UNPROCESSABLE_ENTITY', "Le fichier n'a pas été reçu : envoyez-le à nouveau.");
    if (bytes.length > LEGAL_DOCUMENT_MAX_BYTES) throw new AppException('UNPROCESSABLE_ENTITY', 'Le fichier dépasse 10 Mo.');
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new AppException('UNPROCESSABLE_ENTITY', "Le fichier n'est pas un PDF.");
    }

    const created = (await this.prisma.legalDocumentVersion.create({
      data: {
        kind: input.kind,
        version: input.version,
        storagePath: input.path,
        fileName: `${legalDocumentSlug(input.kind)}-${input.version}.pdf`,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        summary: input.kind === 'CGU' ? (input.summary ?? null) : null,
        publishedByUserId: userId,
      },
    })) as Row;

    if (input.activate) {
      const field = input.kind === 'CGU' ? 'cguCurrentVersion' : 'legalNoticeVersion';
      await this.prisma.platformSettings.upsert({
        where: { id: 'singleton' },
        create: { ...DEFAULT_PLATFORM_SETTINGS, id: 'singleton', [field]: input.version, updatedByUserId: userId },
        update: { [field]: input.version, updatedByUserId: userId },
      });
    }
    return toDto(created);
  }

  /** Any published version, active or not: they are public texts. 404 for an unknown one or a missing file. */
  async readUrl(slug: string, version: string): Promise<string> {
    const kind = legalDocumentKindFromSlug(slug);
    const row = kind ? await this.find(kind, version) : null;
    const missing = new AppException('NOT_FOUND', 'Document introuvable.');
    if (!row || !kind) throw missing;
    const path = legalDocumentStoragePath(kind, version);
    const urls = await this.storage.createSignedReadUrls([path], READ_URL_TTL_SECONDS, LEGAL_DOCUMENT_BUCKET);
    const url = urls.get(path);
    if (!url) throw missing;
    return url;
  }

  /**
   * Q7, Q12: the user accepts the ACTIVE version, and only it, so a screen opened before a newer
   * version was published cannot record the older one. The IP is `cf-connecting-ip` only, as at
   * sign-up (`auth.ts` `recordUserCguConsentProof` says why).
   */
  async acceptCgu(
    userId: string,
    email: string,
    version: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const active = await activeCguVersion(this.prisma);
    if (version !== active) {
      throw new AppException('CONFLICT', "Cette version n'est plus celle en vigueur : rouvrez l'application.");
    }
    const row = await this.find('CGU', version);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { cguAccepted: true, cguAcceptedAt: now, cguVersion: version },
    });
    await new ConsentProofsService(this.prisma).recordProof({
      userId,
      kind: 'CGU_ACCEPTANCE',
      cguVersion: version,
      legalTextSnapshot: CANONICAL_CGU_ACCEPTANCE_TEXT,
      actionProof: 'REACCEPTANCE_CHECKBOX_TICKED',
      ipAddress: headerValue(headers, 'cf-connecting-ip'),
      userAgent: headerValue(headers, 'user-agent'),
      metadata: { email, pdfSha256: row?.sha256 ?? null, source: 'reacceptance' },
      timestamp: now,
    });
  }

  /**
   * V9 B1 (`DEC9-04`, `DEC9-05` (1), (4)). The terms screen's two boxes: the ACTIVE CGU version only
   * (a stale screen is refused as in `acceptCgu`) and the server's active privacy version. The user
   * row and both proofs are written together or not at all; each proof names the sign-up method so
   * the dashboard can show it (`DEC9-06` (1)).
   */
  async acceptSignupTerms(
    userId: string,
    email: string,
    cguVersion: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const active = await activeCguVersion(this.prisma);
    if (cguVersion !== active) {
      throw new AppException('CONFLICT', "Cette version n'est plus celle en vigueur : rouvrez l'application.");
    }
    const privacyVersion = await activePrivacyVersion(this.prisma);
    const row = await this.find('CGU', cguVersion);
    const user = (await this.prisma.user.findUnique({ where: { id: userId }, select: { signupMethod: true } })) as {
      signupMethod: string | null;
    } | null;
    const now = new Date();
    const evidence = {
      actionProof: 'SIGNUP_COMPLETION_CHECKBOXES_TICKED',
      ipAddress: headerValue(headers, 'cf-connecting-ip'),
      userAgent: headerValue(headers, 'user-agent'),
      timestamp: now,
    };
    const metadata = { email, signupMethod: user?.signupMethod ?? null, source: 'signup-completion' };
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          cguAccepted: true,
          cguAcceptedAt: now,
          cguVersion,
          privacyAccepted: true,
          privacyAcceptedAt: now,
          privacyVersion,
        },
      });
      const proofs = new ConsentProofsService(tx as never);
      await proofs.recordProof({
        userId,
        kind: 'CGU_ACCEPTANCE',
        cguVersion,
        legalTextSnapshot: CANONICAL_CGU_ACCEPTANCE_TEXT,
        metadata: { ...metadata, pdfSha256: row?.sha256 ?? null },
        ...evidence,
      });
      await proofs.recordProof({
        userId,
        kind: 'PRIVACY_ACCEPTANCE',
        privacyVersion,
        legalTextSnapshot: CANONICAL_PRIVACY_ACCEPTANCE_TEXT,
        metadata,
        ...evidence,
      });
    });
  }
}
