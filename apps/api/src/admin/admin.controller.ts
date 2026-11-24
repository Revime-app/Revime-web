import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  addDisputeNoteSchema,
  adminBrandListQuerySchema,
  CANCELLATION_REASON_LABEL,
  adminCancellationListQuerySchema,
  adminChangeCategorySchema,
  adminCreateShipmentSchema,
  adminComplianceListQuerySchema,
  adminDeleteDemandeSchema,
  adminDeleteUserSchema,
  adminDisputeListQuerySchema,
  adminHideDemandeSchema,
  adminModerateUserSchema,
  adminModelListQuerySchema,
  adminPaymentListQuerySchema,
  adminRefundListQuerySchema,
  adminReorderCategoriesSchema,
  adminRevokeVerificationSchema,
  adminShipmentListQuerySchema,
  adminStatsQuerySchema,
  adminSuspendRepairerSchema,
  adminSuspendUserSchema,
  adminInternalNoteInputSchema,
  adminSendUserEmailSchema,
  ATTENTION_UNDISMISSABLE_REASONS,
  type AdminInternalNoteInput,
  type AdminSendUserEmailInput,
  adminVerificationListQuerySchema,
  assignDisputeSchema,
  createBrandSchema,
  createCategorySchema,
  createDeviceModelSchema,
  createFaultTypeSchema,
  updateFaultTypeSchema,
  reorderFaultTypesSchema,
  issueLabelsSchema,
  moderateOfferBodySchema,
  openDisputeSchema,
  refundBreakdownInputSchema,
  refuseCancellationSchema,
  resolveDisputeSchema,
  resolveDisputeRefundSchema,
  resolveReportBodySchema,
  sirenSchema,
  toggleCategoryActiveSchema,
  updateBrandSchema,
  updateCategorySchema,
  updateDeviceModelSchema,
  adminAttentionDismissSchema,
  adminAuditListQuerySchema,
  type AddDisputeNoteInput,
  type AdminAttentionDismissInput,
  type AdminAttentionItem,
  type AdminBadgeCounts,
  type AdminSearchResult,
  type AdminCancellationDetail,
  type AdminCancellationListItem,
  type AdminCancellationListQuery,
  type AdminAuditListResponse,
  type AdminAuditDetailedEntry,
  type AdminAuditKpis,
  type AdminBrandListItem,
  type AdminBrandListQuery,
  type AdminBrandListResponse,
  type AdminCatalogOverviewDto,
  type AdminCategoryTreeItem,
  type AdminChangeCategoryInput,
  type AdminCommandeDetail,
  type AdminCommandeSummary,
  type AdminCreateShipmentInput,
  type AdminComplianceListQuery,
  type AdminComplianceListResponse,
  type AdminComplianceVerifyResponse,
  type AdminConversationView,
  type AdminDeleteDemandeInput,
  type AdminDeleteUserInput,
  type AdminDemandeDetail,
  type AdminDemandeListResponse,
  type AdminDeviceModelListItem,
  type AdminDeviceModelListResponse,
  type AdminDisputeDossierDto,
  type AdminDisputeListQuery,
  type AdminDisputeListResponse,
  type DisputeAssigneeItem,
  type AdminHideDemandeInput,
  type AdminModerateUserInput,
  type AdminModelListQuery,
  type AdminOfferContextDto,
  type AdminOffreListResponse,
  type AdminOverview,
  type AdminPaymentListQuery,
  type AdminPaymentListResponse,
  type AdminRefundDetail,
  type AdminRefundListQuery,
  type AdminRefundListResponse,
  type AdminRegistryLookupResult,
  type AdminReorderCategoriesInput,
  type AdminReportDetailDto,
  type AdminReportItem,
  type AdminReportListResponse,
  type AdminRevokeVerificationInput,
  type AdminStatsOverviewDto,
  type AdminStatsQuery,
  type AdminShipmentListQuery,
  type AdminShipmentListResponse,
  type AdminSuspendRepairerInput,
  type AdminSuspendUserInput,
  type AdminUserDetail,
  type AdminUserFiscalRemindResponse,
  type AdminUserListResponse,
  type AdminVerificationListQuery,
  type AdminVerificationListResponse,
  type AssignDisputeInput,
  type CategoryDto,
  type CreateBrandInput,
  type CreateCategoryInput,
  type CreateDeviceModelInput,
  type CreateFaultTypeInput,
  type UpdateFaultTypeInput,
  type ReorderFaultTypesInput,
  type FaultTypeDto,
  type IssueLabelsInput,
  type ModerateOfferBody,
  type OpenDisputeInput,
  type RefundBreakdown,
  type RefundBreakdownInput,
  type RefuseCancellationInput,
  type ResolveDisputeInput,
  type ResolveDisputeRefundInput,
  type ResolveReportBody,
  type ToggleCategoryActiveInput,
  type UpdateBrandInput,
  type UpdateCategoryInput,
  type UpdateDeviceModelInput,
  suggestedRefund,
  formatDisputeReference,
  normaliseOrderSearch,
  orderIdPrefix,
  adminTipInputSchema,
  adminTipListQuerySchema,
  adminTipUpdateSchema,
  type AdminTipInput,
  type AdminTipItem,
  type AdminTipListQuery,
  type AdminTipsResponse,
  type AdminTipUpdate,
  adminReviewListQuerySchema,
  hideReviewInputSchema,
  type AdminReviewDetail,
  type AdminReviewListQuery,
  type AdminReviewsPage,
  type HideReviewInput,
  identityAcceptInputSchema,
  identityRefuseInputSchema,
  type IdentityAcceptInput,
  type IdentityRefuseInput,
  adminDisputeMessageSchema,
  type AdminDisputeMessageInput,
  type AdminDisputeSpacesDto,
  inviteStaffInputSchema,
  type InviteStaffInput,
  type StaffInvitationsListResponse,
  type StaffMemberItem,
  adminStaffListQuerySchema,
  type AdminStaffListQuery,
  type AdminStaffListResponse,
  businessDecisionSchema,
  type BusinessDecisionInput,
  type AdminBusinessDetailsResponse,
  type AdminVerificationAlertsResponse,
  adminSearchQuerySchema,
  type AdminSearchDetailedResponse,
} from '@revime/shared';
import { z } from 'zod';
import { AppException } from '../common/app-exception.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RefundService } from '../commandes/refund.service.js';
import { shareOwedCents } from '../commandes/refund-plan.js';
import { CronService } from '../cron/cron.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ShipmentsService } from '../shipping/shipments.service.js';
import { AdminRoleGuard } from './admin-role.guard.js';
import {
  RequirePermission,
  StaffOnly,
} from './require-permission.decorator.js';
import { AdminStaffService } from './admin-staff.service.js';
import { AdminStaffInvitationsService } from './admin-staff-invitations.service.js';
import { AdminCancellationsService } from './admin-cancellations.service.js';
import { AdminDisputeSpacesService } from './admin-dispute-spaces.service.js';
import {
  ROLE_PERMISSIONS,
  can,
  adminRoleChangeInputSchema,
  type AdminMe,
  type AdminRole,
  type AdminRoleChangeInput,
} from '@revime/shared';
import { ModerationAdminService } from './moderation-admin.service.js';
import { AdminOverviewService } from './admin-overview.service.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminUsersWriteService } from './admin-users-write.service.js';
import { AdminRepairersService } from './admin-repairers.service.js';
import { AdminRepairersWriteService } from './admin-repairers-write.service.js';
import { AdminDemandesService } from './admin-demandes.service.js';
import { AdminDemandesWriteService } from './admin-demandes-write.service.js';
import { AdminOffresService } from './admin-offres.service.js';
import { AdminDisputesService } from './admin-disputes.service.js';
import { AdminPaymentsService } from './admin-payments.service.js';
import { AdminShipmentsListService } from './admin-shipments-list.service.js';
import { AdminRefundsService } from './admin-refunds.service.js';
import { AdminVerificationsService } from './admin-verifications.service.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminTipsService } from './admin-tips.service.js';
import { AdminReviewsService } from './admin-reviews.service.js';
import { AdminIdentityDecisionsService } from './admin-identity-decisions.service.js';
import { AdminComplianceService } from './admin-compliance.service.js';
import { Audit } from './admin-audit.decorator.js';
import { AdminAuditInterceptor } from './admin-audit.interceptor.js';
import { effectiveDisputeStatus } from './dispute-effective-status.js';
import { signAttachmentUrls } from '../storage/attachment-paths.js';

const NOT_FOUND = 'Ressource introuvable.';
const NOT_PARCEL = "Cette commande n'est pas un envoi par colis.";
const NOT_IN_ATTENTION = "Cette commande n'est pas (ou plus) dans la liste des commandes à surveiller.";
const ATTENTION_NOT_DISMISSIBLE =
  "Cette anomalie se règle par une action (répondre à la demande d'annulation, verser ou récupérer les fonds) : elle ne peut pas être marquée comme traitée.";
const NOT_PAID = "Cette commande n'est pas encore payée.";
const ADDRESSES_MISSING = 'Les deux adresses ne sont pas encore renseignées.';
const LABELS_ISSUED = 'Les étiquettes ont déjà été émises.';

export const adminSignAttachmentSchema = z.object({
  space: z.enum(['MAIN', 'CLIENT', 'REPAIRER']),
  contentType: z.enum(['image/jpeg', 'image/png', 'application/pdf'], {
    message: 'Seuls les formats JPEG, PNG et PDF sont acceptés.',
  }),
});
export type AdminSignAttachmentInput = z.infer<
  typeof adminSignAttachmentSchema
>;

function formatShortReference(value: string, prefix = 'CMD'): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^#?([A-Za-z]+)-([A-Fa-f0-9]{6,12})/);
  if (match) {
    const p = (match[1] ?? '').toUpperCase();
    const hex = (match[2] ?? '').toUpperCase();
    return `${p}-${hex}`;
  }
  const hex = trimmed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
  return `${prefix.toUpperCase()}-${hex}`;
}

/** An ISO instant, or null when the column is empty. */
const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const STEP_ORDER: Record<string, number> = {
  PAID: 1,
  PARCEL_SENT: 2,
  PARCEL_RECEIVED: 3,
  REPAIR_STARTED: 4,
  REPAIR_DONE: 5,
  RETURN_SENT: 6,
  RETURN_RECEIVED: 7,
  AWAITING_VALIDATION: 8,
  RELEASED: 9,
};

@Controller('admin')
@UseGuards(AdminRoleGuard)
@UseInterceptors(AdminAuditInterceptor)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundService,
    private readonly cron: CronService,
    private readonly catalog: CatalogService,
    private readonly moderationAdmin: ModerationAdminService,
    private readonly overviewService: AdminOverviewService,
    private readonly auditService: AdminAuditService,
    private readonly users: AdminUsersService,
    private readonly usersWrite: AdminUsersWriteService,
    private readonly repairers: AdminRepairersService,
    private readonly repairersWrite: AdminRepairersWriteService,
    private readonly demandes: AdminDemandesService,
    private readonly demandesWrite: AdminDemandesWriteService,
    private readonly offres: AdminOffresService,
    // Livraison Boxtal: the shipment retry route goes through the same guarded ordering path.
    private readonly shipments: ShipmentsService,
    private readonly disputes?: AdminDisputesService,
    private readonly payments?: AdminPaymentsService,
    private readonly catalogAdmin?: AdminCatalogService,
    private readonly stats?: AdminStatsService,
    private readonly shipmentsList?: AdminShipmentsListService,
    private readonly refundsList?: AdminRefundsService,
    private readonly verificationsList?: AdminVerificationsService,
    // CF4-L. Optional + value import (never `import type`: Nest reads design:paramtypes).
    private readonly tipsAdmin?: AdminTipsService,
    private readonly reviewsAdmin?: AdminReviewsService,
    // CF4-M. Optional only so positional test constructions keep compiling; Nest always injects
    // it (value import - `admin-module-di.spec.ts` gates the provider).
    private readonly identityDecisions?: AdminIdentityDecisionsService,
    // CF4-N. Optional for the same reason as identityDecisions; value import.
    private readonly staff?: AdminStaffService,
    // CF4-I. Optional for the same reason as identityDecisions/staff; value import.
    private readonly cancellationsAdmin?: AdminCancellationsService,
    // CF4-J. Dispute spaces for MAIN, CLIENT, REPAIRER.
    private readonly disputeSpaces?: AdminDisputeSpacesService,
    // CF5-09. Staff accounts & email invitations flow.
    private readonly staffInvitations?: AdminStaffInvitationsService,
    // CF6-19 Compliance Audit Trail
    private readonly compliance?: AdminComplianceService,
  ) {}

  /**
   * CF4-40 / CF4-41, spec §4.4. The one route a staff session reaches BEFORE its second factor:
   * the dashboard reads `twoFactorVerified` to send the operator to /securite, and `permissions`
   * to hide what the role lacks. The API's 403s remain the protection.
   */
  @StaffOnly()
  @Get('me')
  me(@Session() session: UserSession): AdminMe {
    const s = session as unknown as {
      user: { role?: string | null };
      session: { twoFactorVerifiedAt?: Date | string | null };
    };
    // The guard admitted this request only for a staff role.
    const role = s.user.role as AdminRole;
    return {
      role,
      permissions: [...ROLE_PERMISSIONS[role]],
      twoFactorVerified: Boolean(s.session?.twoFactorVerifiedAt),
    };
  }

  @RequirePermission('dashboard.read')
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }

  /**
   * DECLARED BEFORE `commandes/:id`, and it must stay there: Nest matches routes
   * in declaration order, so the other way round makes `attention` an id and this
   * list 404s. There is a test pinning it.
   */
  @RequirePermission('dashboard.read')
  @Get('commandes/attention')
  attention(): Promise<AdminAttentionItem[]> {
    return this.cron.attentionItems();
  }

  /**
   * §8.1. One endpoint for all 22 figures, deliberately: 22 independent fetches could
   * leave a half-true dashboard where some tiles loaded and some silently did not.
   */
  @RequirePermission('dashboard.read')
  @Get('overview')
  overview(): Promise<AdminOverview> {
    return this.overviewService.overview();
  }

  /**
   * UI3: Notification badges for queues requiring operator attention.
   * Queried every 60s by the admin navigation sidebar to display red badge counts.
   */
  @RequirePermission('dashboard.read')
  @Get('badge-counts')
  async badgeCounts(): Promise<AdminBadgeCounts> {
    const [counts, attentionItems] = await Promise.all([
      this.overviewService.getBadgeCounts(),
      this.cron.attentionItems(),
    ]);
    return {
      ...counts,
      attention: attentionItems.length,
    };
  }

  /**
   * UI4: Global search across commandes, users, and disputes.
   */
  @RequirePermission('dashboard.read')
  @Get('search')
  search(@Query('q') q?: string): Promise<AdminSearchResult> {
    return this.overviewService.search(q);
  }

  /**
   * F8: Dedicated search hub across commandes, users, demandes, and disputes.
   */
  @RequirePermission('dashboard.read')
  @Get('search/detailed')
  searchDetailed(
    @Query() query: Record<string, string | undefined>,
  ): Promise<AdminSearchDetailedResponse> {
    const parsed = adminSearchQuerySchema.parse(query);
    return this.overviewService.searchDetailed(parsed);
  }

  @RequirePermission('dashboard.read')
  @Get('audit')
  audit(
    @Query() query: Record<string, string | undefined>,
  ): Promise<AdminAuditListResponse> {
    const parsed = adminAuditListQuerySchema.parse(query);
    return this.auditService.listWithFilters(parsed);
  }

  @RequirePermission('dashboard.read')
  @Get('audit/kpis')
  auditKpis(): Promise<AdminAuditKpis> {
    return this.auditService.getAuditKpis();
  }

  @RequirePermission('dashboard.read')
  @Get('audit/export')
  async auditExport(
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = adminAuditListQuerySchema.parse(query);
    const { filename, content } = await this.auditService.exportCsv(parsed);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @RequirePermission('dashboard.read')
  @Get('audit/:id')
  auditDetail(@Param('id') id: string): Promise<AdminAuditDetailedEntry> {
    return this.auditService.getAuditDetail(id);
  }

  /**
   * Delegates to CatalogService.listCategories() - the same usable tree the mobile app reads
   * and the same set USABLE_CATEGORY accepts, so what the operator sees in the dropdown is
   * exactly what changeCategory will accept. No duplication of catalog logic.
   */
  @RequirePermission('dashboard.read')
  @Get('categories')
  categories(): Promise<CategoryDto[]> {
    return this.catalog.listCategories();
  }

  /**
   * §8.2. Search, filter and pagination live server-side: pageSize is fixed at 25 and
   * `page` is clamped, so the browser cannot ask for the whole table.
   */
  @RequirePermission('dashboard.read')
  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('statut') statut?: string,
    @Query('type') type?: string,
    @Query('niveau') niveau?: string,
    @Query('page') page?: string,
  ): Promise<AdminUserListResponse> {
    return this.users.list({
      q,
      statut,
      type,
      niveau,
      page: Number(page || 1),
    });
  }

  /**
   * §8.2's « Consulter un profil ». Nine fields, three of them two-sided.
   *
   * 🛑 The fiscal block (NIF, date of birth, address, bank tail) is DAC7 data, and the DAC7 report
   * needs `payments.manage` since RU-28 (`ISS-044`): a role without it gets the fiche with
   * `fiscal: null` rather than a refusal, because everything else on it is `dashboard.read`.
   */
  @RequirePermission('dashboard.read')
  @Get('users/:id')
  async userDetail(@Session() session: UserSession, @Param('id') id: string): Promise<AdminUserDetail> {
    const detail = await this.users.detail(id);
    const role = (session as unknown as { user: { role?: string | null } }).user.role;
    return can(role, 'payments.manage') ? detail : { ...detail, fiscal: null };
  }

  // detailFields carries the operator's reason into the audit row. Added by the
  // pre-flight scan: without it the interceptor records no reason at all.
  @Audit('user.suspend', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['reason'],
  })
  @RequirePermission('users.moderate')
  @Patch('users/:id/suspend')
  @HttpCode(200)
  async suspendUser(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminSuspendUserSchema))
    body: AdminSuspendUserInput,
  ): Promise<{ ok: true }> {
    await this.usersWrite.suspend(session.user.id, id, body);
    return { ok: true };
  }

  @Audit('user.reactivate', { targetType: 'User', targetParam: 'id' })
  @RequirePermission('users.moderate')
  @Patch('users/:id/reactivate')
  @HttpCode(200)
  async reactivateUser(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.usersWrite.reactivate(session.user.id, id);
    return { ok: true };
  }

  /** V7 A11 (U2, Q6): lifts a login / code lock-out. A staff account's: super admin only (service). */
  @Audit('user.unlock_login', { targetType: 'User', targetParam: 'id' })
  @RequirePermission('users.moderate')
  @Patch('users/:id/unlock-login')
  @HttpCode(200)
  async unlockUserLogin(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.usersWrite.unlockLogin(session.user.id, id);
    return { ok: true };
  }

  /** Only the public-facing fields. Contact and legal-identity fields are read-only. */
  @Audit('user.moderate', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['username', 'name'],
  })
  @RequirePermission('users.moderate')
  @Patch('users/:id/moderate')
  @HttpCode(200)
  async moderateUser(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminModerateUserSchema))
    body: AdminModerateUserInput,
  ): Promise<{ ok: true }> {
    await this.usersWrite.moderate(session.user.id, id, body);
    return { ok: true };
  }

  /**
   * The SOFT delete. See the service - a hard delete cascades through the money trail.
   * 🛑 detailFields is load-bearing HERE above all: the scrub erases the account's own
   * data, so this audit row's `reason` is the only surviving record of why it went.
   */
  @Audit('user.delete', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['reason'],
  })
  @RequirePermission('users.delete')
  @Delete('users/:id')
  @HttpCode(200)
  async deleteUser(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminDeleteUserSchema))
    body: AdminDeleteUserInput,
  ): Promise<{ ok: true }> {
    await this.usersWrite.remove(session.user.id, id, body);
    return { ok: true };
  }

  @Audit('user.note_add', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['content'],
  })
  @RequirePermission('users.moderate')
  @Post('users/:id/notes')
  @HttpCode(200)
  async addUserNote(
    @Param('id') id: string,
    // Validated here; the audit interceptor records `content` from the request body.
    @Body(new ZodValidationPipe(adminInternalNoteInputSchema))
    _body: AdminInternalNoteInput,
  ): Promise<{ ok: true }> {
    return this.users.addInternalNote(id);
  }

  @Audit('user.email_send', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['subject'],
  })
  @RequirePermission('users.moderate')
  @Post('users/:id/email')
  @HttpCode(200)
  async sendUserEmail(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminSendUserEmailSchema))
    body: AdminSendUserEmailInput,
  ): Promise<{ ok: true }> {
    return this.users.sendUserEmail(id, body);
  }

  @Audit('user.password_reset', {
    targetType: 'User',
    targetParam: 'id',
  })
  @RequirePermission('users.moderate')
  @Post('users/:id/reset-password')
  @HttpCode(200)
  async resetUserPassword(@Param('id') id: string): Promise<{ ok: true }> {
    return this.users.resetPassword(id);
  }

  @Audit('user.fiscal_remind', {
    targetType: 'User',
    targetParam: 'id',
  })
  // `payments.manage`, not `users.moderate`: the reminder is about a held payout and mails the réparateur
  // about his tax file, like the DAC7 recaps (`ISS-044`).
  @RequirePermission('payments.manage')
  @Post('users/:id/fiscal/remind')
  @HttpCode(200)
  async sendFiscalReminder(
    @Param('id') id: string,
  ): Promise<AdminUserFiscalRemindResponse> {
    return this.users.sendFiscalReminder(id);
  }

  // ---- §8.3 Réparateurs (piece B2). All four target a User id, so they reuse
  // `users/:id` rather than inventing a second identifier for the same person.

  @Audit('repairer.verification_revoke', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['reason'],
  })
  @RequirePermission('verification.decide')
  @Patch('users/:id/verification/revoke')
  @HttpCode(200)
  async revokeVerification(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminRevokeVerificationSchema))
    body: AdminRevokeVerificationInput,
  ): Promise<{ ok: true }> {
    await this.repairersWrite.revokeVerification(session.user.id, id, body);
    return { ok: true };
  }

  /** Clears the marker and grants NOTHING - it writes no verificationLevel. */
  @Audit('repairer.verification_restore', {
    targetType: 'User',
    targetParam: 'id',
  })
  @RequirePermission('verification.decide')
  @Patch('users/:id/verification/restore')
  @HttpCode(200)
  async restoreVerification(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.repairersWrite.restoreVerification(session.user.id, id);
    return { ok: true };
  }

  // ---- CF4-39 (sub-project M, spec §4.4). An operator's decision on the CURRENT identity
  // session. Separate from revoke / restore above, which act on the person, not the session.

  private identityDecisionsSvc(): AdminIdentityDecisionsService {
    if (!this.identityDecisions) throw new AppException('INTERNAL', NOT_FOUND);
    return this.identityDecisions;
  }

  @Audit('identity.accept', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['note'],
  })
  @RequirePermission('verification.decide')
  @Patch('users/:id/identity/accept')
  @HttpCode(200)
  acceptIdentity(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(identityAcceptInputSchema))
    body: IdentityAcceptInput,
  ): Promise<{ ok: true }> {
    return this.identityDecisionsSvc().accept(session.user.id, id, body);
  }

  @Audit('identity.refuse', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['motif', 'note'],
  })
  @RequirePermission('verification.decide')
  @Patch('users/:id/identity/refuse')
  @HttpCode(200)
  refuseIdentity(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(identityRefuseInputSchema))
    body: IdentityRefuseInput,
  ): Promise<{ ok: true }> {
    return this.identityDecisionsSvc().refuse(session.user.id, id, body);
  }

  @Audit('identity.request_documents', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['motif', 'note'],
  })
  @RequirePermission('verification.decide')
  @Patch('users/:id/identity/request-documents')
  @HttpCode(200)
  requestIdentityDocuments(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(identityRefuseInputSchema))
    body: IdentityRefuseInput,
  ): Promise<{ ok: true }> {
    return this.identityDecisionsSvc().requestDocuments(
      session.user.id,
      id,
      body,
    );
  }

  // ---- CF4-40 / CF4-41 (sub-project N, spec §4.3 - §4.4). Super Admin only.

  private staffSvc(): AdminStaffService {
    if (!this.staff) throw new AppException('INTERNAL', NOT_FOUND);
    return this.staff;
  }

  @Audit('admin.role_change', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['role'],
  })
  @RequirePermission('admin.manage')
  @Patch('users/:id/role')
  @HttpCode(200)
  changeRole(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminRoleChangeInputSchema))
    body: AdminRoleChangeInput,
  ): Promise<{ ok: true }> {
    return this.staffSvc().changeRole(session.user.id, id, body);
  }

  @Audit('admin.2fa_reset', { targetType: 'User', targetParam: 'id' })
  @RequirePermission('admin.manage')
  @Post('users/:id/two-factor/reset')
  @HttpCode(200)
  resetTwoFactor(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.staffSvc().resetTwoFactor(session.user.id, id);
  }

  // ---- CF5-09 (Staff Accounts & Email Invitation Flow). Super Admin only.

  private staffInvitationsSvc(): AdminStaffInvitationsService {
    return (
      this.staffInvitations ?? new AdminStaffInvitationsService(this.prisma)
    );
  }

  @Audit('admin.staff_invite', {
    targetType: 'StaffInvitation',
    detailFields: ['email', 'role'],
  })
  @RequirePermission('admin.manage')
  @Post('staff/invitations')
  @HttpCode(201)
  inviteStaff(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(inviteStaffInputSchema)) body: InviteStaffInput,
  ): Promise<{ ok: true; id: string }> {
    return this.staffInvitationsSvc().createInvitation(session.user.id, body);
  }

  @RequirePermission('admin.manage')
  @Get('staff/invitations')
  listStaffInvitations(): Promise<StaffInvitationsListResponse> {
    return this.staffInvitationsSvc().listInvitations();
  }

  @RequirePermission('admin.manage')
  @Get('staff/members')
  listStaffMembers(
    @Query(new ZodValidationPipe(adminStaffListQuerySchema))
    query: AdminStaffListQuery = { page: 1, pageSize: 20 },
  ): Promise<AdminStaffListResponse> {
    return this.staffInvitationsSvc().listMembers(query);
  }

  @Audit('admin.staff_remove', {
    targetType: 'User',
    targetParam: 'id',
  })
  @RequirePermission('admin.manage')
  @Delete('staff/members/:id')
  @HttpCode(200)
  removeStaffMember(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.staffInvitationsSvc().removeMember(session.user.id, id);
  }

  @Audit('admin.staff_invite_revoke', {
    targetType: 'StaffInvitation',
    targetParam: 'id',
  })
  @RequirePermission('admin.manage')
  @Delete('staff/invitations/:id')
  @HttpCode(200)
  revokeStaffInvitation(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.staffInvitationsSvc().revokeInvitation(session.user.id, id);
  }

  @Audit('admin.staff_invite_resend', {
    targetType: 'StaffInvitation',
    targetParam: 'id',
  })
  @RequirePermission('admin.manage')
  @Post('staff/invitations/:id/resend')
  @HttpCode(200)
  resendStaffInvitation(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.staffInvitationsSvc().resendInvitation(session.user.id, id);
  }

  /** Réparateur-scoped: his client side keeps working. Not Better Auth's account ban. */
  @Audit('repairer.suspend', {
    targetType: 'User',
    targetParam: 'id',
    detailFields: ['reason', 'until'],
  })
  @RequirePermission('users.moderate')
  @Patch('users/:id/repairer/suspend')
  @HttpCode(200)
  async suspendRepairer(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminSuspendRepairerSchema))
    body: AdminSuspendRepairerInput,
  ): Promise<{ ok: true }> {
    await this.repairersWrite.suspend(session.user.id, id, body);
    return { ok: true };
  }

  @Audit('repairer.reactivate', { targetType: 'User', targetParam: 'id' })
  @RequirePermission('users.moderate')
  @Patch('users/:id/repairer/reactivate')
  @HttpCode(200)
  async reactivateRepairer(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.repairersWrite.reactivate(session.user.id, id);
    return { ok: true };
  }

  /**
   * A GET: it writes nothing, and a read should not have to invent an audit action to
   * satisfy the coverage gate. Spec §4.3 records the rejected POST alternative.
   *
   * No literal sibling remains under `reparateurs/` as of CF4-21: the verification queue
   * that used to be declared before this route (`GET reparateurs/verifications`) was
   * removed - it is now `GET verifications` (spec §5), a different path prefix. If a new
   * `reparateurs/:id`-shaped route is ever added, declare it BEFORE this one; Nest matches
   * in declaration order and a `:siren` param declared first would swallow it.
   */
  @RequirePermission('dashboard.read')
  @Get('reparateurs/registry/:siren')
  registryLookup(
    @Param('siren', new ZodValidationPipe(sirenSchema)) siren: string,
  ): Promise<AdminRegistryLookupResult> {
    return this.repairers.registryLookup(siren);
  }

  // ---- §8.4 Demandes (piece C1).
  //
  // 🛑 NO LITERAL SIBLING EXISTS UNDER `demandes/` TODAY, so declaration order is
  // unconstrained here - and if one is ever added (`demandes/export`, say) it MUST be
  // declared BEFORE `demandes/:id`. Nest matches in declaration order and the param would
  // swallow it. `commandes/attention` and `reparateurs/verifications` both carry this note
  // because both were nearly shipped the wrong way round.

  /**
   * Individual `@Query('x')` params converted HERE, following `listUsers` above - not a
   * whole-object `@Query()` typed as `AdminDemandeListQuery`. 🛑 CORRECTED 2026-09-04: an
   * earlier version of this handler took the whole object, which would have delivered
   * `page` as the STRING `"3"` inside a field typed `number`. `Math.trunc` coerces it at
   * runtime so nothing visibly breaks, which is exactly why a type lie like that survives.
   * `Number(page || 1)` is B1's conversion and the service's clamp handles the NaN case.
   */
  @RequirePermission('dashboard.read')
  @Get('demandes')
  listDemandes(
    @Query('q') q?: string,
    @Query('categorie') categorie?: string,
    @Query('statut') statut?: string,
    @Query('etat') etat?: string,
    @Query('type') type?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
    @Query('page') page?: string,
  ): Promise<AdminDemandeListResponse> {
    return this.demandes.list({
      q,
      categorie,
      statut,
      etat,
      type,
      du,
      au,
      page: Number(page || 1),
    });
  }

  /**
   * Read before act. The write routes below all target a row an operator is about to
   * remove from a client's account, and P4's /colis review established that a page offering
   * a destructive action with nothing to check against lets a mis-keyed id through every
   * guard. This is that page's data.
   *
   * NO visibility filter, deliberately: it must load a hidden or deleted demande, or an
   * operator who has just hidden one has no route back to un-hide it.
   */
  @RequirePermission('dashboard.read')
  @Get('demandes/:id')
  demandeDetail(@Param('id') id: string): Promise<AdminDemandeDetail> {
    return this.demandes.detail(id);
  }

  @Audit('demande.category_change', {
    targetType: 'Demande',
    targetParam: 'id',
    detailFields: ['categoryId'],
  })
  @RequirePermission('content.moderate')
  @Patch('demandes/:id/category')
  @HttpCode(200)
  async changeDemandeCategory(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminChangeCategorySchema))
    body: AdminChangeCategoryInput,
  ): Promise<{ ok: true }> {
    await this.demandesWrite.changeCategory(session.user.id, id, body);
    return { ok: true };
  }

  /** Reversible. `unhide` below is the undo, which is why there is no undelete. */
  @Audit('demande.hide', {
    targetType: 'Demande',
    targetParam: 'id',
    detailFields: ['reason'],
  })
  @RequirePermission('content.moderate')
  @Patch('demandes/:id/hide')
  @HttpCode(200)
  async hideDemande(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminHideDemandeSchema))
    body: AdminHideDemandeInput,
  ): Promise<{ ok: true }> {
    await this.demandesWrite.hide(session.user.id, id, body);
    return { ok: true };
  }

  @Audit('demande.unhide', { targetType: 'Demande', targetParam: 'id' })
  @RequirePermission('content.moderate')
  @Patch('demandes/:id/unhide')
  @HttpCode(200)
  async unhideDemande(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.demandesWrite.unhide(session.user.id, id);
    return { ok: true };
  }

  /**
   * 🛑 detailFields is load-bearing here: `deletedReason` is on the row, but the audit row's
   * `reason` is what survives if the row is ever hard-deleted, and it is the only record of
   * WHY a client's listing was taken down. Same reasoning as `user.delete`.
   *
   * DELETE with a body is established here rather than novel - `@Delete('users/:id')` above
   * takes a Zod-validated one.
   */
  @Audit('demande.delete', {
    targetType: 'Demande',
    targetParam: 'id',
    detailFields: ['reason'],
  })
  @RequirePermission('content.moderate')
  @Delete('demandes/:id')
  @HttpCode(200)
  async deleteDemande(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminDeleteDemandeSchema))
    body: AdminDeleteDemandeInput,
  ): Promise<{ ok: true }> {
    await this.demandesWrite.remove(session.user.id, id, body);
    return { ok: true };
  }

  // ---- §8.5 Offres (piece C3).

  @RequirePermission('dashboard.read')
  @Get('offres')
  listOffres(
    @Query('q') q?: string,
    @Query('statut') statut?: string,
    @Query('etat') etat?: string,
    @Query('kind') kind?: string,
    @Query('travel') travel?: string,
    @Query('parcel') parcel?: string,
    @Query('minPriceCents') minPriceCents?: string,
    @Query('maxPriceCents') maxPriceCents?: string,
    @Query('du') du?: string,
    @Query('au') au?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
  ): Promise<AdminOffreListResponse> {
    return this.offres.list({
      q,
      statut,
      etat,
      kind,
      travel,
      parcel,
      minPriceCents: minPriceCents ? Number(minPriceCents) : undefined,
      maxPriceCents: maxPriceCents ? Number(maxPriceCents) : undefined,
      du,
      au,
      sortBy,
      page: Number(page || 1),
    });
  }

  @RequirePermission('dashboard.read')
  @Get('offres/:id/context')
  getOfferContext(@Param('id') id: string): Promise<AdminOfferContextDto> {
    return this.offres.getContext(id);
  }

  @Audit('offer.moderate_delete', {
    targetType: 'Offer',
    targetParam: 'id',
    detailFields: ['reason', 'demandeId', 'repairerUserId'],
  })
  @RequirePermission('content.moderate')
  @Delete('offres/:id')
  @HttpCode(200)
  moderateDeleteOffer(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderateOfferBodySchema))
    body: ModerateOfferBody,
  ) {
    return this.offres.moderateDelete(id, body, session.user.id);
  }

  /**
   * Resolves a commande identifier from a full UUID or a short reference.
   * Bug B15: Short references displayed in the UI (#86642ef2, #CMD-A9DB011E, etc.)
   * must resolve cleanly rather than throwing 404 "Ressource introuvable".
   */
  private async resolveCommandeId(input: string): Promise<string> {
    if (!input || typeof input !== 'string') return input;
    const trimmed = input.trim();
    if (!trimmed) return trimmed;

    // Fast-path: exact match in database
    const exact = await this.prisma.commande.findUnique({
      where: { id: trimmed },
      select: { id: true },
    });
    if (exact) return exact.id;

    // Normalised match
    const normalized = normaliseOrderSearch(trimmed);
    if (normalized && normalized !== trimmed) {
      const matchExactNormalized = await this.prisma.commande.findUnique({
        where: { id: normalized },
        select: { id: true },
      });
      if (matchExactNormalized) return matchExactNormalized.id;
    }

    // Prefix match. This resolver also fronts the refund, label and dispute POSTs, so a prefix
    // that two orders share is refused: « the newest one » would refund or label a guess.
    const prefix = orderIdPrefix(trimmed);
    if (prefix) {
      const candidates = await this.prisma.commande.findMany({
        where: { id: { startsWith: prefix } },
        take: 2,
        select: { id: true },
      });
      if (candidates.length > 1) {
        throw new AppException(
          'CONFLICT',
          'Cette référence courte correspond à plusieurs commandes. Saisissez la référence complète.',
        );
      }
      const [only] = candidates;
      if (only) return only.id;
    }

    return trimmed;
  }

  /**
   * Read before act. P4's review found that /colis shows the operator NOTHING to
   * check against, so a mis-keyed commande id passes every guard and sends a
   * client's device to the wrong réparateur. The same typo on the refund route
   * moves real money in two directions and cannot be undone. One endpoint serves
   * both forms. See the P5 spec §6.5.
   */
  /**
   * F1 Fiche Commande: Return full relational details for order lifecycle.
   * Gated by dashboard.read permission. Also retains backwards-compatible
   * fields for existing refund and parcel views.
   */
  @RequirePermission('dashboard.read')
  @Get('commandes/:id')
  async summary(@Param('id') id: string): Promise<AdminCommandeDetail> {
    const canonicalId = await this.resolveCommandeId(id);
    const row = await this.prisma.commande.findUnique({
      where: { id: canonicalId },
      include: {
        demande: {
          include: {
            category: true,
            faultType: { select: { id: true, labelFr: true, slug: true } },
            photos: true,
          },
        },
        client: true,
        repairer: true,
        offer: true,
        shippingAddresses: { select: { role: true, city: true } },
        // Livraison Boxtal (spec §7.8): quoted versus billed per leg, and why a leg failed.
        shipments: {
          select: {
            leg: true,
            status: true,
            carrierLabel: true,
            quotedCostExclTaxCents: true,
            billedExclTaxCents: true,
            boxtalOrderId: true,
            labelStoragePath: true,
            failureReason: true,
            createdAt: true,
          },
          orderBy: { leg: 'asc' },
        },
        dispute: true,
        review: true,
        cancellationRequests: {
          orderBy: { createdAt: 'desc' },
        },
        stepEvents: { select: { step: true, at: true }, orderBy: { at: 'asc' } },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    const clientCity =
      row.shippingAddresses?.find((a: { role: string }) => a.role === 'CLIENT')
        ?.city ?? null;
    const repairerCity =
      row.shippingAddresses?.find((a: { role: string }) => a.role === 'REPAIRER')
        ?.city ?? null;

    // 1. Storage photo signing
    const rawPhotoPaths = row.demande.photos.map((p) => p.storagePath).filter((p) => p.length > 0);
    const isInlineUrl = (p: string) => /^(https?:|data:)/.test(p);
    const photosToSign = rawPhotoPaths.filter((p) => !isInlineUrl(p));

    let signedPhotosMap = new Map<string, string>();
    if (photosToSign.length > 0) {
      try {
        signedPhotosMap = await signAttachmentUrls({ photo: photosToSign, document: [] });
      } catch {
        // Fallback to raw paths if storage is not configured or signing fails
      }
    }
    const photoUrls = rawPhotoPaths.map((p) => (isInlineUrl(p) ? p : (signedPhotosMap.get(p) ?? p)));

    // 2. Timeline. Each step's moment is the `CommandeStepEvent` the transition wrote, not a
    // guess: `updatedAt` moves with any later edit and `Commande.validatedAt` does not exist.
    const stepAt = new Map<string, Date>();
    for (const e of row.stepEvents) if (!stepAt.has(e.step)) stepAt.set(e.step, e.at);
    const demandeCreatedAt = row.demande.createdAt.toISOString();
    const stepOrder = row.step ? (STEP_ORDER[row.step] ?? 0) : 0;

    const timeline = [
      {
        key: 'CREATED',
        label: 'Demande publiée',
        timestamp: demandeCreatedAt,
        completed: true,
        current: row.status === 'PENDING_PAYMENT',
      },
      {
        key: 'PAID',
        label: 'Paiement validé & séquestre',
        timestamp: isoOrNull(row.paidAt),
        completed: row.status !== 'PENDING_PAYMENT' && row.status !== 'ABANDONED',
        current: (row.step === null || row.step === 'PAID') && row.status === 'PAID',
      },
      {
        key: 'PARCEL_OR_WORKSHOP',
        label: row.delivery === 'PARCEL' ? 'Colis expédié' : (row.delivery === 'WORKSHOP' ? 'Dépôt en atelier' : 'Prise en charge'),
        timestamp: isoOrNull(stepAt.get('PARCEL_SENT') ?? stepAt.get('PARCEL_RECEIVED') ?? row.shipments[0]?.createdAt),
        completed: stepOrder >= 2,
        current: row.delivery === 'PARCEL' ? (row.step === 'PARCEL_SENT' || row.step === 'PARCEL_RECEIVED') : false,
      },
      {
        key: 'REPAIR_STARTED',
        label: 'Réparation en cours',
        timestamp: isoOrNull(stepAt.get('REPAIR_STARTED')),
        completed: stepOrder >= 4,
        current: row.step === 'REPAIR_STARTED' || row.step === 'REPAIR_DONE',
      },
      {
        key: 'AWAITING_VALIDATION',
        label: 'Validation client',
        timestamp: isoOrNull(stepAt.get('AWAITING_VALIDATION')),
        completed: stepOrder >= 8,
        current: row.step === 'AWAITING_VALIDATION',
      },
      {
        key: 'RELEASED',
        label: 'Fonds débloqués',
        timestamp: isoOrNull(row.transferredAt ?? row.releasedAt),
        completed: row.step === 'RELEASED',
        current: row.step === 'RELEASED',
      },
    ];

    // 3. Conversation: there is no Commande -> Conversation relation, the thread is the one
    // between these two people about this demande.
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        demandeId: row.demandeId,
        clientUserId: row.clientUserId,
        repairerUserId: row.repairerUserId,
        deletedAt: null,
      },
      select: { id: true },
    });
    const conversationId = conversation?.id ?? null;

    // 4. Offer mapping
    const offer = {
      id: row.offer.id,
      amountCents: row.offer.priceCents,
      parts: row.offer.partsLabel,
      warranty: row.offer.warrantyLabel,
      message: row.offer.comment,
      createdAt: row.offer.createdAt.toISOString(),
    };

    // 5. Client & Repairer
    const client = {
      userId: row.client.id,
      name: row.client.name,
      email: row.client.email,
      city: clientCity,
      phone: row.client.phone ?? null,
    };

    const repairer = {
      userId: row.repairer.id,
      name: row.repairer.name,
      email: row.repairer.email,
      city: repairerCity,
      phone: row.repairer.phone ?? null,
    };

    // 6. Dispute. ISS-085 / B11: the status the other five admin surfaces show, so a dispute on
    // a refunded order reads « résolu » here too instead of the stored « ouvert ».
    const dispute = row.dispute
      ? (() => {
          const shown = effectiveDisputeStatus({
            status: row.dispute.status,
            verdict: row.dispute.verdict,
            commande: row,
          });
          return {
            id: row.dispute.id,
            disputeNumber: formatDisputeReference(row.dispute.number),
            status: shown.status,
            reason: row.dispute.reason,
            verdict: shown.verdict,
            createdAt: row.dispute.createdAt.toISOString(),
            resolvedAt: isoOrNull(row.dispute.resolvedAt),
          };
        })()
      : null;

    // 7. Review
    const review = row.review
      ? {
          id: row.review.id,
          rating: row.review.rating,
          comment: row.review.comment,
          published: row.review.deletedAt === null,
          createdAt: row.review.createdAt.toISOString(),
        }
      : null;

    // 8. Cancellation: the open request if any, else the latest (the list is newest first)
    const latestRequest =
      row.cancellationRequests.find((r) => r.status === 'PENDING') ?? row.cancellationRequests[0];
    const cancellation = latestRequest
      ? {
          id: latestRequest.id,
          requesterRole:
            latestRequest.requestedByUserId === row.clientUserId
              ? ('CLIENT' as const)
              : latestRequest.requestedByUserId === row.repairerUserId
                ? ('REPAIRER' as const)
                : ('ADMIN' as const),
          reason: latestRequest.comment
            ? `${CANCELLATION_REASON_LABEL[latestRequest.reason]} : ${latestRequest.comment}`
            : CANCELLATION_REASON_LABEL[latestRequest.reason],
          status: latestRequest.status,
          createdAt: latestRequest.createdAt.toISOString(),
        }
      : null;

    // 9. Shipments
    const mappedShipments = row.shipments.map((s) => ({
      leg: s.leg,
      status: s.status,
      carrierLabel: s.carrierLabel,
      quotedCostExclTaxCents: s.quotedCostExclTaxCents,
      billedExclTaxCents: s.billedExclTaxCents,
      boxtalOrderId: s.boxtalOrderId,
      labelReady: s.labelStoragePath !== null,
      failureReason: s.failureReason,
    }));

    // 10. Amounts & Stripe
    const amounts = {
      repairCents: row.repairCents ?? 0,
      shippingCents: row.shippingCents ?? 0,
      protectionCents: row.protectionCents ?? 0,
      totalCents: row.totalCents ?? 0,
      shareOwedCents: shareOwedCents(row),
      suggestedRefund: suggestedRefund(row),
      refund:
        row.refundRepairCents === null || row.refundRepairCents === undefined
          ? null
          : {
              repairCents: row.refundRepairCents,
              shippingCents: row.refundShippingCents ?? 0,
              protectionCents: row.refundProtectionCents ?? 0,
              totalCents: row.refundedCents ?? 0,
            },
    };

    const stripe = {
      paymentIntentId: row.stripePaymentIntentId,
      chargeId: row.stripeChargeId,
      transferId: row.stripeTransferId,
      refundId: row.stripeRefundId,
      transferSucceeded: Boolean(row.transferredAt || (row.stripeTransferId && row.step === 'RELEASED')),
      hasCharge: Boolean(row.stripeChargeId),
    };

    const result: AdminCommandeDetail & Record<string, any> = {
      commandeId: row.id,
      reference: formatShortReference(row.id, 'CMD'),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : (row.createdAt ? String(row.createdAt) : new Date().toISOString()),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : (row.updatedAt ? String(row.updatedAt) : new Date().toISOString()),
      status: row.status,
      step: row.status === 'REFUNDED' ? null : (row.step ?? null),
      delivery: row.delivery,
      amounts,
      stripe,
      demande: {
        id: row.demande?.id ?? row.demandeId ?? '',
        title: row.demande?.title ?? '',
        description: row.demande?.description ?? null,
        categoryLabel: row.demande.category?.labelFr ?? null,
        faultType: row.demande.faultType ?? null,
        photos: photoUrls,
        createdAt: demandeCreatedAt,
      },
      offer,
      client,
      repairer,
      shipments: mappedShipments,
      dispute,
      review,
      cancellation,
      timeline,
      conversationId,

      // Backwards-compatibility for existing admin pages (/remboursement, /colis, etc.)
      demandeTitle: row.demande?.title ?? '',
      clientName: row.client?.name ?? '',
      repairerName: row.repairer?.name ?? '',
      clientCity,
      repairerCity,
      repairCents: row.repairCents,
      shippingCents: row.shippingCents,
      protectionCents: row.protectionCents,
      totalCents: row.totalCents,
      transferred: row.stripeTransferId !== null,
      refunded: row.stripeRefundId !== null,
      disputed: row.status !== 'REFUNDED' && row.disputedAt !== null,
      insuranceCents: row.insuranceCents ?? 0,
      suggestion: amounts.suggestedRefund,
      refund: amounts.refund,
      shareOwedCents: amounts.shareOwedCents,
      cancellationPending: row.cancellationRequestedAt !== null,
      hasStripeCharge: row.stripeChargeId !== null,
    };

    return result;
  }

  /**
   * MANUAL driver only (Livraison Boxtal, 2026-09-04: under `SHIPPING_DRIVER=boxtal` the server orders the
   * labels itself and this route goes unused). The operator buys two labels by hand and records what the
   * carrier gave him.
   * Both numbers together in one call, because he buys them in one sitting and a
   * half-recorded pair is a state with no use.
   *
   * No flag guard, deliberately: gating this on PAYMENTS_ENABLED would lock the
   * one person able to unstick a stuck order out with the same switch that
   * created the situation. It is unreachable in production regardless - no
   * commande can be PAID while the flag is off.
   */
  @Audit('commande.parcel.issue_labels', {
    targetType: 'Commande',
    targetParam: 'id',
  })
  @RequirePermission('shipping.operate')
  @Patch('commandes/:id/parcel')
  async issueLabels(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(issueLabelsSchema)) body: IssueLabelsInput,
  ): Promise<{ ok: true }> {
    const canonicalId = await this.resolveCommandeId(id);
    const row = await this.prisma.commande.findUnique({
      where: { id: canonicalId },
      select: {
        delivery: true,
        status: true,
        outboundTrackingNumber: true,
        shippingAddresses: { select: { role: true } },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (row.delivery !== 'PARCEL')
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_PARCEL);
    if (row.status !== 'PAID')
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_PAID);
    if (row.shippingAddresses.length !== 2) {
      throw new AppException('UNPROCESSABLE_ENTITY', ADDRESSES_MISSING);
    }
    // The double-issue guard the column deliberately does not express as a
    // unique index: a carrier number is unique in the carrier's namespace, not
    // ours, so the guard belongs where the mistake is made.
    if (row.outboundTrackingNumber !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', LABELS_ISSUED);
    }

    await this.prisma.commande.update({
      where: { id: canonicalId },
      data: {
        outboundTrackingNumber: body.outboundTrackingNumber,
        returnTrackingNumber: body.returnTrackingNumber,
      },
    });
    return { ok: true };
  }

  /**
   * Livraison Boxtal (spec §7.8). Re-order a leg Boxtal refused - only from FAILED, through the
   * same guarded ordering path the automatic order took, so a second refusal lands in the same
   * place (FAILED again, ops mail) rather than somewhere new.
   */
  @Audit('commande.shipment.retry', {
    targetType: 'Commande',
    targetParam: 'id',
  })
  @RequirePermission('shipping.operate')
  @Post('commandes/:id/shipments/:leg/retry')
  @HttpCode(200)
  async retryShipment(
    @Param('id') id: string,
    @Param('leg') leg: string,
  ): Promise<{ ok: true }> {
    if (leg !== 'OUTBOUND' && leg !== 'RETURN')
      throw new AppException('VALIDATION_FAILED', 'Trajet invalide.');
    const canonicalId = await this.resolveCommandeId(id);
    await this.shipments.retryLeg(canonicalId, leg);
    return { ok: true };
  }

  /**
   * P16: Direct admin label URL retrieval without sender/recipient restrictions.
   */
  @RequirePermission('shipping.operate')
  @Get('commandes/:id/shipments/:leg/label')
  async getShipmentLabel(
    @Param('id') id: string,
    @Param('leg') leg: string,
  ): Promise<{ url: string }> {
    const canonicalId = await this.resolveCommandeId(id);
    return this.shipments.getAdminLabelUrl(canonicalId, leg);
  }

  /**
   * P16: Dispatch sender drop-off reminder notification.
   */
  @Audit('shipment.remind', {
    targetType: 'Commande',
    targetParam: 'id',
    detailFields: ['leg'],
  })
  @RequirePermission('shipping.operate')
  @Post('commandes/:id/shipments/:leg/remind')
  @HttpCode(200)
  async sendShipmentReminder(
    @Param('id') id: string,
    @Param('leg') leg: string,
  ): Promise<{ ok: true }> {
    const canonicalId = await this.resolveCommandeId(id);
    await this.shipments.sendDropoffReminder(canonicalId, leg);
    return { ok: true };
  }

  /**
   * P16: Admin shipment label creation with carrier selection.
   */
  @Audit('shipment.create', {
    targetType: 'Commande',
    targetParam: 'id',
    detailFields: ['carrier', 'leg'],
  })
  @RequirePermission('shipping.operate')
  @Post('commandes/:id/shipments/create')
  @HttpCode(200)
  async createAdminShipment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminCreateShipmentSchema)) body: AdminCreateShipmentInput,
  ): Promise<{ ok: true; shipmentId: string; carrierLabel: string }> {
    const canonicalId = await this.resolveCommandeId(id);
    return this.shipments.adminCreateShipment(
      canonicalId,
      body.leg,
      body.carrier,
      body.weightGrams,
    );
  }

  /**
   * The operator's one remedy. Its shape is read from the row rather than passed
   * in: not released ⇒ refund the charge; released ⇒ reverse the transfer, then
   * refund. See the P5 spec §6.2.
   */
  @Audit('commande.refund', {
    targetType: 'Commande',
    targetParam: 'id',
    detailFields: [
      'motif',
      'note',
      'repairCents',
      'shippingCents',
      'protectionCents',
    ],
  })
  @RequirePermission('refunds.issue')
  @Post('commandes/:id/refund')
  @HttpCode(200)
  async refund(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundBreakdownInputSchema))
    body: RefundBreakdownInput,
  ): Promise<{ ok: true }> {
    const canonicalId = await this.resolveCommandeId(id);
    await this.refunds.refund(session.user.id, canonicalId, body);
    return { ok: true };
  }

  /**
   * CF4-D task 5 (spec §3, §7). The operator's retry for a réparateur share that
   * stayed owed after a partial refund - the SHARE_OWED attention reason names
   * exactly the rows this route can act on.
   */
  @Audit('commande.refund_pay_share', {
    targetType: 'Commande',
    targetParam: 'id',
  })
  @RequirePermission('refunds.issue')
  @Post('commandes/:id/refund/pay-share')
  @HttpCode(200)
  async payShare(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true; transferredCents: number }> {
    const canonicalId = await this.resolveCommandeId(id);
    const { transferredCents } = await this.refunds.payShare(
      session.user.id,
      canonicalId,
    );
    return { ok: true, transferredCents };
  }

  /**
   * Bug B3: Cancel a PAID order whose Stripe charge cannot be found (CHARGE_MISSING).
   * `RefundService.cancelWithoutCharge` asks Stripe first and refuses when money was collected.
   */
  @Audit('commande.cancel', { targetType: 'Commande', targetParam: 'id' })
  @RequirePermission('refunds.issue')
  @Post('commandes/:id/cancel')
  @HttpCode(200)
  async cancelCommande(
    @Param('id') id: string,
    @Req() req?: { params?: Record<string, string> },
  ): Promise<{ ok: true }> {
    const canonicalId = await this.resolveCommandeId(id);
    // The audit interceptor reads the target from the route param: a short reference would
    // otherwise be logged instead of the order it resolved to (same as dismissAttention).
    if (req?.params) req.params.id = canonicalId;
    await this.refunds.cancelWithoutCharge(canonicalId);

    return { ok: true };
  }

  /**
   * P15: Dismiss an anomaly on a commande from the attention queue.
   * Records an audit log with action 'attention.dismiss' and persists the operator's reason.
   */
  @Audit('attention.dismiss', {
    targetType: 'Commande',
    targetParam: 'id',
    detailFields: ['reason'],
  })
  @RequirePermission('disputes.handle')
  @Post('commandes/:id/attention/dismiss')
  @HttpCode(200)
  async dismissAttention(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminAttentionDismissSchema))
    _body: AdminAttentionDismissInput,
    @Req() req?: { params?: Record<string, string> },
  ): Promise<{ ok: true }> {
    const canonicalId = await this.resolveCommandeId(id);
    const item = (await this.cron.attentionItems()).find((i) => i.commandeId === canonicalId);
    if (!item) throw new AppException('UNPROCESSABLE_ENTITY', NOT_IN_ATTENTION);
    if (item.reasons?.some((r) => ATTENTION_UNDISMISSABLE_REASONS.includes(r))) {
      throw new AppException('UNPROCESSABLE_ENTITY', ATTENTION_NOT_DISMISSIBLE);
    }
    // The audit interceptor writes the dismissal (and the operator's reason) against this id.
    if (req?.params) req.params.id = canonicalId;
    return { ok: true };
  }

  // ---- moderation (Étape 5 pieces 2 and 3). No literal path collides with an `:id`
  // sibling here, unlike `commandes/attention` above, so declaration order is not
  // load-bearing for any of them. Deliberately NOT stating how many there are: that
  // count drifted the moment piece 3 added one, which is this project's own rule
  // about asserting counts.

  @RequirePermission('dashboard.read')
  @Get('reports')
  listReports(
    @Query() query: any,
    @Session() session?: UserSession,
  ): Promise<AdminReportListResponse> {
    return this.moderationAdmin.listReports({
      ...query,
      actorUserId: session?.user?.id,
    });
  }

  @RequirePermission('dashboard.read')
  @Get('reports/:id')
  getReport(@Param('id') id: string): Promise<AdminReportDetailDto> {
    return this.moderationAdmin.getReportDetail(id);
  }

  /** Read before act, before closing a channel. See the service's comment. */
  @RequirePermission('conversations.read')
  @Get('conversations/:id')
  viewConversation(@Param('id') id: string): Promise<AdminConversationView> {
    return this.moderationAdmin.viewConversation(id);
  }

  @Audit('report.assign', {
    targetType: 'ConversationReport',
    targetParam: 'id',
  })
  @RequirePermission('reports.handle')
  @Patch('reports/:id/assign')
  @HttpCode(200)
  async assignReport(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    await this.moderationAdmin.assignReport(id, session?.user?.id ?? 'admin');
    return { ok: true };
  }

  @Audit('report.unassign', {
    targetType: 'ConversationReport',
    targetParam: 'id',
  })
  @RequirePermission('reports.handle')
  @Patch('reports/:id/unassign')
  @HttpCode(200)
  async unassignReport(@Param('id') id: string): Promise<{ ok: true }> {
    await this.moderationAdmin.unassignReport(id);
    return { ok: true };
  }

  @Audit('report.resolve', {
    targetType: 'ConversationReport',
    targetParam: 'id',
  })
  @RequirePermission('reports.handle')
  @Patch('reports/:id/resolve')
  @HttpCode(200)
  async resolveReport(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() rawBody?: unknown,
  ): Promise<{ ok: true }> {
    const parsed = resolveReportBodySchema.safeParse(rawBody);
    const body: Partial<ResolveReportBody> | undefined = parsed.success
      ? parsed.data
      : typeof rawBody === 'object' && rawBody !== null
        ? {
            verdict: 'RESOLVED_OTHER',
            note:
              typeof (rawBody as any).note === 'string'
                ? (rawBody as any).note
                : undefined,
          }
        : undefined;
    await this.moderationAdmin.resolveReport(
      id,
      session?.user?.id ?? 'admin',
      body,
    );
    return { ok: true };
  }

  @Audit('conversation.close', {
    targetType: 'Conversation',
    targetParam: 'id',
  })
  @RequirePermission('content.moderate')
  @Patch('conversations/:id/close')
  @HttpCode(200)
  async closeConversation(@Param('id') id: string): Promise<{ ok: true }> {
    await this.moderationAdmin.closeConversation(id);
    return { ok: true };
  }

  /** The undo. Writes `deletedAt` and nothing else - see spec §8.1. */
  @Audit('conversation.reopen', {
    targetType: 'Conversation',
    targetParam: 'id',
  })
  @RequirePermission('content.moderate')
  @Patch('conversations/:id/reopen')
  @HttpCode(200)
  async reopenConversation(@Param('id') id: string): Promise<{ ok: true }> {
    await this.moderationAdmin.reopenConversation(id);
    return { ok: true };
  }

  @Audit('message.delete', { targetType: 'Message', targetParam: 'id' })
  @RequirePermission('content.moderate')
  @Patch('messages/:id/delete')
  @HttpCode(200)
  async deleteMessage(@Param('id') id: string): Promise<{ ok: true }> {
    await this.moderationAdmin.deleteMessage(id);
    return { ok: true };
  }

  /**
   * CF4-37 (sub-project L). The old `PATCH reviews/:id/delete` (no motif, no restore, no page)
   * is REMOVED: a hide now requires a motif from a fixed list and is reversible. Its audit
   * action `review.delete` stays in the schema for historical rows.
   */
  private reviewsSvc(): AdminReviewsService {
    return this.reviewsAdmin ?? new AdminReviewsService(this.prisma);
  }

  @RequirePermission('dashboard.read')
  @Get('reviews')
  listReviews(
    @Query(new ZodValidationPipe(adminReviewListQuerySchema))
    query: AdminReviewListQuery,
  ): Promise<AdminReviewsPage> {
    return this.reviewsSvc().list(query);
  }

  @RequirePermission('dashboard.read')
  @Get('reviews/:id')
  reviewDetail(@Param('id') id: string): Promise<AdminReviewDetail> {
    return this.reviewsSvc().detail(id);
  }

  @Audit('review.hide', {
    targetType: 'Review',
    targetParam: 'id',
    detailFields: ['motif', 'note'],
  })
  @RequirePermission('content.moderate')
  @Patch('reviews/:id/hide')
  @HttpCode(200)
  hideReview(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(hideReviewInputSchema)) body: HideReviewInput,
  ): Promise<AdminReviewDetail> {
    return this.reviewsSvc().hide(id, body, session.user.id);
  }

  @Audit('review.restore', { targetType: 'Review', targetParam: 'id' })
  @RequirePermission('content.moderate')
  @Patch('reviews/:id/restore')
  @HttpCode(200)
  restoreReview(@Param('id') id: string): Promise<AdminReviewDetail> {
    return this.reviewsSvc().restore(id);
  }

  // --- §8.6 Gestion des paiements & §8.7 Gestion des litiges ---

  @RequirePermission('dashboard.read')
  @Get('payments')
  async listPayments(
    @Query(new ZodValidationPipe(adminPaymentListQuerySchema))
    query: AdminPaymentListQuery,
  ): Promise<AdminPaymentListResponse> {
    return this.payments!.list(query);
  }

  @Audit('commande.abandon_stale')
  @RequirePermission('payments.manage')
  @Post('payments/abandon-stale')
  @HttpCode(200)
  async abandonStalePayments(): Promise<{ count: number }> {
    return this.payments!.abandonStalePayments();
  }

  /**
   * CF4-20 (spec §3). Does not collide with `commandes/:id/shipments/:leg/retry` above -
   * different path prefix (`admin/shipments` vs `admin/commandes/:id/shipments/:leg/retry`),
   * so declaration order is not load-bearing here.
   */
  @RequirePermission('dashboard.read')
  @Get('shipments')
  async listShipments(
    @Query(new ZodValidationPipe(adminShipmentListQuerySchema))
    query: AdminShipmentListQuery,
  ): Promise<AdminShipmentListResponse> {
    return this.shipmentsList!.list(query);
  }

  /**
   * CF4-19 (spec §4). `refunds` (literal) is declared BEFORE `refunds/:commandeId`,
   * the same reason `commandes/attention` precedes `commandes/:id` above - Nest
   * matches routes in declaration order, and the other way round would make this
   * list route consume `refunds` as an id on the detail route instead.
   */
  @RequirePermission('dashboard.read')
  @Get('refunds')
  async listRefunds(
    @Query(new ZodValidationPipe(adminRefundListQuerySchema))
    query: AdminRefundListQuery,
  ): Promise<AdminRefundListResponse> {
    return this.refundsList!.list(query);
  }

  @RequirePermission('dashboard.read')
  @Get('refunds/:commandeId')
  async getRefundDetail(
    @Param('commandeId') commandeId: string,
  ): Promise<AdminRefundDetail> {
    return this.refundsList!.detail(commandeId);
  }

  /**
   * A-3: Verification fraud and discrepancy alerts (Compliance Brief Page 9, Mockup page9_img2.png).
   */
  @RequirePermission('dashboard.read')
  @Get('verifications/alerts')
  async getVerificationAlerts(): Promise<AdminVerificationAlertsResponse> {
    return this.verificationsList!.getAlerts();
  }

  /**
   * CF4-21 (spec §5). Replaces the old réparateur verification queue
   * (`GET reparateurs/verifications`, removed) - one row per verification (identity,
   * business) rather than one row per account, with the operator's filters and a
   * needs-action default.
   */
  @RequirePermission('dashboard.read')
  @Get('verifications')
  async listVerifications(
    @Query(new ZodValidationPipe(adminVerificationListQuerySchema))
    query: AdminVerificationListQuery,
  ): Promise<AdminVerificationListResponse> {
    return this.verificationsList!.list(query);
  }

  /**
   * CF5-07. Detailed business verification view for review.
   */
  @RequirePermission('verification.decide')
  @Get('verifications/business/:userId/details')
  async getBusinessDetails(
    @Param('userId') userId: string,
  ): Promise<AdminBusinessDetailsResponse> {
    return this.verificationsList!.getBusinessDetails(userId);
  }

  /**
   * CF5-07. Validates business verification, promotes profile to BUSINESS, and notifies repairer.
   */
  @Audit('admin.business_verify_approve', {
    targetType: 'User',
    targetParam: 'userId',
  })
  @RequirePermission('verification.decide')
  @Patch('verifications/business/:userId/approve')
  async approveBusiness(
    @Session() session: UserSession,
    @Param('userId') userId: string,
  ): Promise<{ success: true }> {
    return this.verificationsList!.approveBusiness(session.user.id, userId);
  }

  /**
   * CF5-07. Refuses business verification with motif and optional note.
   */
  @Audit('admin.business_verify_refuse', {
    targetType: 'User',
    targetParam: 'userId',
    detailFields: ['motif', 'note'],
  })
  @RequirePermission('verification.decide')
  @Patch('verifications/business/:userId/refuse')
  async refuseBusiness(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(businessDecisionSchema))
    body: BusinessDecisionInput,
  ): Promise<{ success: true }> {
    return this.verificationsList!.refuseBusiness(
      session.user.id,
      userId,
      body,
    );
  }

  /**
   * CF5-07. Requests new business documents with motif and optional note.
   */
  @Audit('admin.business_verify_request_documents', {
    targetType: 'User',
    targetParam: 'userId',
    detailFields: ['motif', 'note'],
  })
  @RequirePermission('verification.decide')
  @Patch('verifications/business/:userId/request-documents')
  async requestBusinessDocuments(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(businessDecisionSchema))
    body: BusinessDecisionInput,
  ): Promise<{ success: true }> {
    return this.verificationsList!.requestBusinessDocuments(
      session.user.id,
      userId,
      body,
    );
  }

  @RequirePermission('dashboard.read')
  @Get('litiges')
  async listDisputes(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(adminDisputeListQuerySchema))
    query: AdminDisputeListQuery,
  ): Promise<AdminDisputeListResponse> {
    return this.disputes!.list(query, session?.user?.id);
  }

  @RequirePermission('dashboard.read')
  @Get('litiges/assignees')
  async listAssignees(): Promise<DisputeAssigneeItem[]> {
    return this.disputes!.listAssignees();
  }

  @RequirePermission('dashboard.read')
  @Get('litiges/:id')
  async getDisputeDossier(
    @Param('id') id: string,
  ): Promise<AdminDisputeDossierDto> {
    return this.disputes!.getDossier(id);
  }

  /**
   * CF4-27 (spec §4.4, §4.5). The « Annulations » queue - the two dashboard tabs
   * (PENDING oldest first, HISTORY newest first).
   */
  @RequirePermission('dashboard.read')
  @Get('cancellations')
  async listCancellations(
    @Query(new ZodValidationPipe(adminCancellationListQuerySchema))
    query: AdminCancellationListQuery,
  ): Promise<AdminCancellationListItem[]> {
    return this.cancellationsAdmin!.list(query);
  }

  @RequirePermission('dashboard.read')
  @Get('cancellations/:id')
  async getCancellation(
    @Param('id') id: string,
  ): Promise<AdminCancellationDetail> {
    return this.cancellationsAdmin!.getDetail(id);
  }

  @Audit('cancellation.refuse', {
    targetType: 'CancellationRequest',
    targetParam: 'id',
    detailFields: ['note'],
  })
  @RequirePermission('refunds.issue')
  @Post('cancellations/:id/refuse')
  @HttpCode(200)
  async refuseCancellation(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refuseCancellationSchema))
    body: RefuseCancellationInput,
  ): Promise<{ ok: true }> {
    return this.cancellationsAdmin!.refuse(session.user.id, id, body);
  }

  @Audit('cancellation.approve', {
    targetType: 'CancellationRequest',
    targetParam: 'id',
    detailFields: ['note', 'repairCents', 'shippingCents', 'protectionCents'],
  })
  @RequirePermission('refunds.issue')
  @Post('cancellations/:id/approve')
  @HttpCode(200)
  async approveCancellation(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundBreakdownInputSchema))
    body: RefundBreakdownInput,
  ): Promise<{ ok: true }> {
    return this.cancellationsAdmin!.approve(session.user.id, id, body);
  }

  @Audit('dispute.open', {
    targetType: 'Commande',
    targetParam: 'id',
    detailFields: ['reason', 'initiator'],
  })
  @RequirePermission('disputes.handle')
  @Post('commandes/:id/dispute')
  @HttpCode(201)
  async openDispute(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(openDisputeSchema)) body: OpenDisputeInput,
  ): Promise<{ ok: true; disputeId: string }> {
    const canonicalId = await this.resolveCommandeId(id);
    return this.disputes!.openDispute(session?.user?.id ?? 'admin', canonicalId, body);
  }

  @Audit('dispute.assign', {
    targetType: 'Dispute',
    targetParam: 'id',
    detailFields: ['assigneeUserId'],
  })
  @RequirePermission('disputes.handle')
  @Patch('litiges/:id/assign')
  @HttpCode(200)
  async assignDispute(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignDisputeSchema)) body: AssignDisputeInput,
  ): Promise<{ ok: true }> {
    return this.disputes!.assign(
      session?.user?.id ?? 'admin',
      id,
      body.assigneeUserId,
    );
  }

  @Audit('dispute.unassign', { targetType: 'Dispute', targetParam: 'id' })
  @RequirePermission('disputes.handle')
  @Patch('litiges/:id/unassign')
  @HttpCode(200)
  async unassignDispute(@Param('id') id: string): Promise<{ ok: true }> {
    return this.disputes!.unassign(id);
  }

  @Audit('dispute.note', {
    targetType: 'Dispute',
    targetParam: 'id',
    detailFields: ['note'],
  })
  @RequirePermission('disputes.handle')
  @Post('litiges/:id/notes')
  @HttpCode(201)
  async addDisputeNote(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addDisputeNoteSchema))
    body: AddDisputeNoteInput,
  ): Promise<{ ok: true }> {
    return this.disputes!.addNote(session?.user?.id ?? 'admin', id, body.note);
  }

  @Audit('dispute.resolve_release', {
    targetType: 'Dispute',
    targetParam: 'id',
    detailFields: ['resolutionNote'],
  })
  @RequirePermission('disputes.resolve')
  @Post('litiges/:id/resolve-release')
  @HttpCode(200)
  async resolveRelease(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema))
    body: ResolveDisputeInput,
  ): Promise<{ ok: true }> {
    return this.disputes!.resolveRelease(
      session?.user?.id ?? 'admin',
      id,
      body.resolutionNote,
    );
  }

  @Audit('dispute.resolve_refund', {
    targetType: 'Dispute',
    targetParam: 'id',
    // CF4-D task 6 (spec §6). The amounts and motif now matter to the audit
    // trail the same way they do on the plain refund route: 'resolutionNote'
    // alone no longer says what was actually decided.
    detailFields: [
      'motif',
      'repairCents',
      'shippingCents',
      'protectionCents',
      'resolutionNote',
    ],
  })
  @RequirePermission('disputes.resolve')
  @Post('litiges/:id/resolve-refund')
  @HttpCode(200)
  async resolveRefund(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveDisputeRefundSchema))
    body: ResolveDisputeRefundInput,
  ): Promise<{ ok: true }> {
    return this.disputes!.resolveRefund(session?.user?.id ?? 'admin', id, body);
  }

  @Audit('dispute.resolve_dismiss', {
    targetType: 'Dispute',
    targetParam: 'id',
    detailFields: ['resolutionNote'],
  })
  @RequirePermission('disputes.resolve')
  @Post('litiges/:id/resolve-dismiss')
  @HttpCode(200)
  async resolveDismiss(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema))
    body: ResolveDisputeInput,
  ): Promise<{ ok: true }> {
    return this.disputes!.resolveDismiss(
      session?.user?.id ?? 'admin',
      id,
      body.resolutionNote,
    );
  }

  // CF4-J (spec §4.6). The three dispute spaces: MAIN conversation, CLIENT space, REPAIRER space.
  @RequirePermission('disputes.handle')
  @Get('litiges/:id/espaces')
  async getDisputeSpaces(
    @Param('id') id: string,
  ): Promise<AdminDisputeSpacesDto> {
    return this.disputeSpaces!.get(id);
  }

  @Audit('dispute.message', {
    targetType: 'Dispute',
    targetParam: 'id',
    detailFields: ['space'],
  })
  @RequirePermission('disputes.handle')
  @Post('litiges/:id/messages')
  @HttpCode(201)
  async sendDisputeMessage(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminDisputeMessageSchema))
    body: AdminDisputeMessageInput,
  ): Promise<{ ok: true }> {
    return this.disputeSpaces!.post(session?.user?.id ?? 'admin', id, body);
  }

  @RequirePermission('disputes.handle')
  @Post('litiges/:id/attachments/sign')
  @HttpCode(201)
  async signDisputeAttachment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminSignAttachmentSchema))
    body: AdminSignAttachmentInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    return this.disputeSpaces!.signUpload(id, body.space, {
      contentType: body.contentType,
    });
  }

  // =========================================================================
  // Stage 6 Piece E (§8.9 Catégories, marques, modèles)
  // =========================================================================

  @RequirePermission('dashboard.read')
  @Get('catalog/overview')
  getCatalogOverview(): Promise<AdminCatalogOverviewDto> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).getCatalogOverview();
  }

  @RequirePermission('dashboard.read')
  @Get('catalog/categories')
  listCategoriesTree(): Promise<AdminCategoryTreeItem[]> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).listCategoriesTree();
  }

  @Audit('category.create', {
    targetType: 'Category',
    detailFields: ['labelFr', 'slug', 'parentId'],
  })
  @RequirePermission('catalog.manage')
  @Post('catalog/categories')
  @HttpCode(201)
  createCategory(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createCategorySchema))
    body: CreateCategoryInput,
  ): Promise<AdminCategoryTreeItem> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).createCategory(body, session?.user?.id);
  }

  @Audit('category.reorder', {
    targetType: 'Category',
    detailFields: ['categoryIds'],
  })
  @RequirePermission('catalog.manage')
  @Patch('catalog/categories/reorder')
  @HttpCode(200)
  reorderCategories(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(adminReorderCategoriesSchema))
    body: AdminReorderCategoriesInput,
  ): Promise<{ success: true }> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).reorderCategories(body.categoryIds, session?.user?.id);
  }

  @Audit('category.update', {
    targetType: 'Category',
    targetParam: 'id',
    detailFields: ['labelFr', 'slug'],
  })
  @RequirePermission('catalog.manage')
  @Patch('catalog/categories/:id')
  @HttpCode(200)
  updateCategory(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema))
    body: UpdateCategoryInput,
  ): Promise<AdminCategoryTreeItem> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).updateCategory(id, body, session?.user?.id);
  }

  @Audit('category.toggle_active', {
    targetType: 'Category',
    targetParam: 'id',
    detailFields: ['active'],
  })
  @RequirePermission('catalog.manage')
  @Patch('catalog/categories/:id/active')
  @HttpCode(200)
  toggleCategoryActive(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(toggleCategoryActiveSchema))
    body: ToggleCategoryActiveInput,
  ): Promise<AdminCategoryTreeItem> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).toggleCategoryActive(id, body, session?.user?.id);
  }

  @RequirePermission('dashboard.read')
  @Get('catalog/brands')
  listBrands(
    @Query(new ZodValidationPipe(adminBrandListQuerySchema))
    query: AdminBrandListQuery,
  ): Promise<AdminBrandListResponse> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).listBrands(query);
  }

  @Audit('brand.create', {
    targetType: 'Brand',
    detailFields: ['name', 'slug'],
  })
  @RequirePermission('catalog.manage')
  @Post('catalog/brands')
  @HttpCode(201)
  createBrand(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createBrandSchema)) body: CreateBrandInput,
  ): Promise<AdminBrandListItem> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).createBrand(body, session?.user?.id);
  }

  @Audit('brand.update', {
    targetType: 'Brand',
    targetParam: 'id',
    detailFields: ['name', 'slug'],
  })
  @RequirePermission('catalog.manage')
  @Patch('catalog/brands/:id')
  @HttpCode(200)
  updateBrand(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) body: UpdateBrandInput,
  ): Promise<AdminBrandListItem> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).updateBrand(id, body, session?.user?.id);
  }

  @Audit('brand.delete', { targetType: 'Brand', targetParam: 'id' })
  @RequirePermission('catalog.manage')
  @Delete('catalog/brands/:id')
  @HttpCode(200)
  deleteBrand(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).deleteBrand(id, session?.user?.id);
  }

  @RequirePermission('dashboard.read')
  @Get('catalog/models')
  listModels(
    @Query(new ZodValidationPipe(adminModelListQuerySchema))
    query: AdminModelListQuery,
  ): Promise<AdminDeviceModelListResponse> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).listModels(query);
  }

  @Audit('model.create', {
    targetType: 'DeviceModel',
    detailFields: ['name', 'slug', 'brandId'],
  })
  @RequirePermission('catalog.manage')
  @Post('catalog/models')
  @HttpCode(201)
  createModel(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createDeviceModelSchema))
    body: CreateDeviceModelInput,
  ): Promise<AdminDeviceModelListItem> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).createModel(body, session?.user?.id);
  }

  @Audit('model.update', {
    targetType: 'DeviceModel',
    targetParam: 'id',
    detailFields: ['name', 'slug'],
  })
  @RequirePermission('catalog.manage')
  @Patch('catalog/models/:id')
  @HttpCode(200)
  updateModel(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDeviceModelSchema))
    body: UpdateDeviceModelInput,
  ): Promise<AdminDeviceModelListItem> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).updateModel(id, body, session?.user?.id);
  }

  @Audit('model.delete', { targetType: 'DeviceModel', targetParam: 'id' })
  @RequirePermission('catalog.manage')
  @Delete('catalog/models/:id')
  @HttpCode(200)
  deleteModel(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).deleteModel(id, session?.user?.id);
  }

  // --- Feature F12: Types de panne (Fault types catalog subsystem) ---

  @RequirePermission('dashboard.read')
  @Get('catalog/fault-types')
  listFaultTypes(
    @Query() query: { categoryId?: string; active?: string; q?: string },
  ): Promise<FaultTypeDto[]> {
    const active =
      query.active === 'true'
        ? true
        : query.active === 'false'
          ? false
          : undefined;
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).listFaultTypes({ categoryId: query.categoryId, active, q: query.q });
  }

  @Audit('fault_type.create', { targetType: 'FaultType' })
  @RequirePermission('catalog.manage')
  @Post('catalog/fault-types')
  @HttpCode(201)
  createFaultType(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(createFaultTypeSchema))
    body: CreateFaultTypeInput,
  ): Promise<FaultTypeDto> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).createFaultType(body, session?.user?.id);
  }

  @Audit('fault_type.update', { targetType: 'FaultType', targetParam: 'id' })
  @RequirePermission('catalog.manage')
  @Patch('catalog/fault-types/:id')
  @HttpCode(200)
  updateFaultType(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFaultTypeSchema))
    body: UpdateFaultTypeInput,
  ): Promise<FaultTypeDto> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).updateFaultType(id, body, session?.user?.id);
  }

  @Audit('fault_type.delete', { targetType: 'FaultType', targetParam: 'id' })
  @RequirePermission('catalog.manage')
  @Delete('catalog/fault-types/:id')
  @HttpCode(200)
  deleteFaultType(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<{ ok: true; deleted: boolean }> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).deleteFaultType(id, session?.user?.id);
  }

  @Audit('fault_type.reorder', {
    targetType: 'Category',
    detailFields: ['categoryId', 'orderedIds'],
  })
  @RequirePermission('catalog.manage')
  @Post('catalog/fault-types/reorder')
  @HttpCode(200)
  reorderFaultTypes(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(reorderFaultTypesSchema))
    body: ReorderFaultTypesInput,
  ): Promise<{ ok: true }> {
    return (
      this.catalogAdmin ?? new AdminCatalogService(this.prisma)
    ).reorderFaultTypes(body, session?.user?.id);
  }

  // --- CF4-38 « Conseils du jour » (sub-project L, spec §4.3) ---

  private tipsSvc(): AdminTipsService {
    return this.tipsAdmin ?? new AdminTipsService(this.prisma);
  }

  @RequirePermission('dashboard.read')
  @Get('tips')
  listTips(
    @Query(new ZodValidationPipe(adminTipListQuerySchema))
    query: AdminTipListQuery,
  ): Promise<AdminTipsResponse> {
    return this.tipsSvc().list(query);
  }

  @Audit('tip.create', {
    targetType: 'Tip',
    detailFields: ['category', 'active', 'startsAt', 'endsAt'],
  })
  @RequirePermission('catalog.manage')
  @Post('tips')
  @HttpCode(201)
  createTip(
    @Body(new ZodValidationPipe(adminTipInputSchema)) body: AdminTipInput,
  ): Promise<AdminTipItem> {
    return this.tipsSvc().create(body);
  }

  @Audit('tip.update', {
    targetType: 'Tip',
    targetParam: 'id',
    detailFields: ['category', 'active', 'startsAt', 'endsAt'],
  })
  @RequirePermission('catalog.manage')
  @Patch('tips/:id')
  @HttpCode(200)
  updateTip(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminTipUpdateSchema)) body: AdminTipUpdate,
  ): Promise<AdminTipItem> {
    return this.tipsSvc().update(id, body);
  }

  @Audit('tip.delete', { targetType: 'Tip', targetParam: 'id' })
  @RequirePermission('catalog.manage')
  @Delete('tips/:id')
  @HttpCode(200)
  deleteTip(@Param('id') id: string): Promise<{ ok: true }> {
    return this.tipsSvc().remove(id);
  }

  @RequirePermission('dashboard.read')
  @Get('stats/overview')
  async getStatsOverview(
    @Query(new ZodValidationPipe(adminStatsQuerySchema)) query: AdminStatsQuery,
  ): Promise<AdminStatsOverviewDto> {
    if (!this.stats) {
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        'Service de statistiques non disponible.',
      );
    }
    return this.stats.getOverview(query);
  }

  // ---- CF6-19 Compliance Audit Trail

  private complianceSvc(): AdminComplianceService {
    if (!this.compliance) {
      throw new AppException('INTERNAL', NOT_FOUND);
    }
    return this.compliance;
  }

  // Audited although it is a read: each row carries an e-mail, an IP address and a user agent.
  @Audit('compliance.proofs_view', { targetType: 'ConsentProof' })
  @RequirePermission('compliance.read')
  @Get('compliance/proofs')
  listComplianceProofs(
    @Query(new ZodValidationPipe(adminComplianceListQuerySchema))
    query: AdminComplianceListQuery,
  ): Promise<AdminComplianceListResponse> {
    return this.complianceSvc().list(query);
  }

  @Audit('compliance.proof_verify', {
    targetType: 'ConsentProof',
    targetParam: 'id',
  })
  @RequirePermission('compliance.read')
  @Post('compliance/proofs/:id/verify')
  @HttpCode(200)
  verifyComplianceProof(
    @Param('id') id: string,
  ): Promise<AdminComplianceVerifyResponse> {
    return this.complianceSvc().verify(id);
  }
}
