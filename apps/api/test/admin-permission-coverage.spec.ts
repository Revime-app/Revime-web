import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type AdminPermission } from '@revime/shared';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminPayoutsController } from '../src/admin/admin-payouts.controller.js';
import { AdminExportsController } from '../src/admin/admin-exports.controller.js';
import { AdminAlertsController } from '../src/admin/admin-alerts.controller.js';
import { AdminConversationsController } from '../src/admin/admin-conversations.controller.js';
import { AdminSettingsController } from '../src/admin/admin-settings.controller.js';
import { PERMISSION_KEY, STAFF_ONLY_KEY } from '../src/admin/require-permission.decorator.js';

/**
 * CF4-40, spec §4.1 route column, decision N2. ENUMERATED by name, not counted: a new handler
 * without a permission, or a handler whose permission drifts, is a visible diff here.
 */
const EXPECTED: Record<string, AdminPermission | 'STAFF_ONLY'> = {
  me: 'STAFF_ONLY',
  // dashboard.read - every GET except conversations/:id
  ping: 'dashboard.read',
  attention: 'dashboard.read',
  overview: 'dashboard.read',
  badgeCounts: 'dashboard.read',
  search: 'dashboard.read',
  searchDetailed: 'dashboard.read',
  audit: 'dashboard.read',
  auditKpis: 'dashboard.read',
  auditExport: 'dashboard.read',
  auditDetail: 'dashboard.read',
  categories: 'dashboard.read',
  listUsers: 'dashboard.read',
  userDetail: 'dashboard.read',
  registryLookup: 'dashboard.read',
  listDemandes: 'dashboard.read',
  demandeDetail: 'dashboard.read',
  listOffres: 'dashboard.read',
  getOfferContext: 'dashboard.read',
  summary: 'dashboard.read',
  listReports: 'dashboard.read',
  getReport: 'dashboard.read',
  listReviews: 'dashboard.read',
  reviewDetail: 'dashboard.read',
  listPayments: 'dashboard.read',
  listShipments: 'dashboard.read',
  listRefunds: 'dashboard.read',
  getRefundDetail: 'dashboard.read',
  listVerifications: 'dashboard.read',
  getVerificationAlerts: 'dashboard.read',
  listDisputes: 'dashboard.read',
  listAssignees: 'dashboard.read',
  getDisputeDossier: 'dashboard.read',
  getCatalogOverview: 'dashboard.read',
  listCategoriesTree: 'dashboard.read',
  listBrands: 'dashboard.read',
  listModels: 'dashboard.read',
  listFaultTypes: 'dashboard.read',
  listTips: 'dashboard.read',
  getStatsOverview: 'dashboard.read',
  viewConversation: 'conversations.read',
  addUserNote: 'users.moderate',
  sendUserEmail: 'users.moderate',
  resetUserPassword: 'users.moderate',
  sendFiscalReminder: 'payments.manage',
  suspendUser: 'users.moderate',
  reactivateUser: 'users.moderate',
  // V7 A11 (U2)
  unlockUserLogin: 'users.moderate',
  moderateUser: 'users.moderate',
  suspendRepairer: 'users.moderate',
  reactivateRepairer: 'users.moderate',
  deleteUser: 'users.delete',
  acceptIdentity: 'verification.decide',
  refuseIdentity: 'verification.decide',
  requestIdentityDocuments: 'verification.decide',
  getBusinessDetails: 'verification.decide',
  approveBusiness: 'verification.decide',
  refuseBusiness: 'verification.decide',
  requestBusinessDocuments: 'verification.decide',
  revokeVerification: 'verification.decide',
  restoreVerification: 'verification.decide',
  changeDemandeCategory: 'content.moderate',
  hideDemande: 'content.moderate',
  unhideDemande: 'content.moderate',
  deleteDemande: 'content.moderate',
  moderateDeleteOffer: 'content.moderate',
  hideReview: 'content.moderate',
  restoreReview: 'content.moderate',
  deleteMessage: 'content.moderate',
  closeConversation: 'content.moderate',
  reopenConversation: 'content.moderate',
  assignReport: 'reports.handle',
  unassignReport: 'reports.handle',
  resolveReport: 'reports.handle',
  openDispute: 'disputes.handle',
  assignDispute: 'disputes.handle',
  unassignDispute: 'disputes.handle',
  addDisputeNote: 'disputes.handle',
  getDisputeSpaces: 'disputes.handle',
  sendDisputeMessage: 'disputes.handle',
  signDisputeAttachment: 'disputes.handle',
  resolveRelease: 'disputes.resolve',
  resolveRefund: 'disputes.resolve',
  resolveDismiss: 'disputes.resolve',
  refund: 'refunds.issue',
  payShare: 'refunds.issue',
  cancelCommande: 'refunds.issue',
  listCancellations: 'dashboard.read',
  getCancellation: 'dashboard.read',
  refuseCancellation: 'refunds.issue',
  approveCancellation: 'refunds.issue',
  issueLabels: 'shipping.operate',
  retryShipment: 'shipping.operate',
  getShipmentLabel: 'shipping.operate',
  sendShipmentReminder: 'shipping.operate',
  createAdminShipment: 'shipping.operate',
  createCategory: 'catalog.manage',
  updateCategory: 'catalog.manage',
  toggleCategoryActive: 'catalog.manage',
  reorderCategories: 'catalog.manage',
  createBrand: 'catalog.manage',
  updateBrand: 'catalog.manage',
  deleteBrand: 'catalog.manage',
  createModel: 'catalog.manage',
  updateModel: 'catalog.manage',
  deleteModel: 'catalog.manage',
  createFaultType: 'catalog.manage',
  updateFaultType: 'catalog.manage',
  deleteFaultType: 'catalog.manage',
  reorderFaultTypes: 'catalog.manage',
  createTip: 'catalog.manage',
  updateTip: 'catalog.manage',
  deleteTip: 'catalog.manage',
  changeRole: 'admin.manage',
  resetTwoFactor: 'admin.manage',
  // CF5-09 (Staff Accounts & Email Invitation Flow)
  inviteStaff: 'admin.manage',
  listStaffInvitations: 'admin.manage',
  listStaffMembers: 'admin.manage',
  revokeStaffInvitation: 'admin.manage',
  resendStaffInvitation: 'admin.manage',
  removeStaffMember: 'admin.manage',
  listComplianceProofs: 'compliance.read',
  verifyComplianceProof: 'compliance.read',
  abandonStalePayments: 'payments.manage',
  dismissAttention: 'disputes.handle',
};

type Handler = (...args: unknown[]) => unknown;
const reflected = (): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const name of Object.getOwnPropertyNames(AdminController.prototype)) {
    const fn = AdminController.prototype[name as keyof AdminController] as unknown as Handler;
    if (name === 'constructor' || typeof fn !== 'function' || !Reflect.hasMetadata(PATH_METADATA, fn)) continue;
    out[name] = Reflect.getMetadata(STAFF_ONLY_KEY, fn) ? 'STAFF_ONLY' : Reflect.getMetadata(PERMISSION_KEY, fn);
  }
  return out;
};

describe('every AdminController route declares exactly its permission', () => {
  it('matches the enumerated table, handler by handler', () => {
    expect(reflected()).toEqual(EXPECTED);
  });

  it('never marks a handler both staff-only and permissioned', () => {
    for (const name of Object.getOwnPropertyNames(AdminController.prototype)) {
      const fn = AdminController.prototype[name as keyof AdminController] as unknown as Handler;
      if (typeof fn !== 'function') continue;
      expect(Boolean(Reflect.getMetadata(STAFF_ONLY_KEY, fn) && Reflect.getMetadata(PERMISSION_KEY, fn))).toBe(false);
    }
  });
});

describe('GET admin/me', () => {
  const controller = Object.create(AdminController.prototype) as AdminController;

  it('returns the role, its permissions and the session proof', () => {
    const at = new Date();
    expect(
      controller.me({ user: { role: 'finance' }, session: { twoFactorVerifiedAt: at } } as never),
    ).toEqual({ role: 'finance', permissions: [...ROLE_PERMISSIONS.finance], twoFactorVerified: true });
    expect(
      controller.me({ user: { role: 'read_only' }, session: { twoFactorVerifiedAt: null } } as never),
    ).toEqual({ role: 'read_only', permissions: ['dashboard.read'], twoFactorVerified: false });
  });
});

const EXPECTED_PAYOUTS: Record<string, AdminPermission> = {
  listIncompleteAccounts: 'dashboard.read',
  payoutKpis: 'dashboard.read',
  exportCsv: 'dashboard.read',
  syncAccount: 'payments.manage',
  remindAccount: 'payments.manage',
  triggerFiscalReminders: 'users.moderate',
  retryTransfer: 'payments.manage',
  payoutDetail: 'dashboard.read',
  listPayouts: 'dashboard.read',
};

const reflectedPayouts = (): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const name of Object.getOwnPropertyNames(AdminPayoutsController.prototype)) {
    const fn = AdminPayoutsController.prototype[name as keyof AdminPayoutsController] as unknown as Handler;
    if (name === 'constructor' || typeof fn !== 'function' || !Reflect.hasMetadata(PATH_METADATA, fn)) continue;
    out[name] = Reflect.getMetadata(STAFF_ONLY_KEY, fn) ? 'STAFF_ONLY' : Reflect.getMetadata(PERMISSION_KEY, fn);
  }
  return out;
};

describe('every AdminPayoutsController route declares exactly its permission', () => {
  it('matches the enumerated table, handler by handler', () => {
    expect(reflectedPayouts()).toEqual(EXPECTED_PAYOUTS);
  });

  it('never marks a handler both staff-only and permissioned', () => {
    for (const name of Object.getOwnPropertyNames(AdminPayoutsController.prototype)) {
      const fn = AdminPayoutsController.prototype[name as keyof AdminPayoutsController] as unknown as Handler;
      if (typeof fn !== 'function') continue;
      expect(Boolean(Reflect.getMetadata(STAFF_ONLY_KEY, fn) && Reflect.getMetadata(PERMISSION_KEY, fn))).toBe(false);
    }
  });
});

const EXPECTED_EXPORTS: Record<string, AdminPermission> = {
  exportSummary: 'dashboard.read',
  exportPreview: 'dashboard.read',
  exportDownload: 'dashboard.read',
  sendDac7Recaps: 'payments.manage',
};

const reflectedExports = (): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const name of Object.getOwnPropertyNames(AdminExportsController.prototype)) {
    const fn = AdminExportsController.prototype[name as keyof AdminExportsController] as unknown as Handler;
    if (name === 'constructor' || typeof fn !== 'function' || !Reflect.hasMetadata(PATH_METADATA, fn)) continue;
    out[name] = Reflect.getMetadata(STAFF_ONLY_KEY, fn) ? 'STAFF_ONLY' : Reflect.getMetadata(PERMISSION_KEY, fn);
  }
  return out;
};

describe('every AdminExportsController route declares exactly its permission', () => {
  it('matches the enumerated table, handler by handler', () => {
    expect(reflectedExports()).toEqual(EXPECTED_EXPORTS);
  });

  it('never marks a handler both staff-only and permissioned', () => {
    for (const name of Object.getOwnPropertyNames(AdminExportsController.prototype)) {
      const fn = AdminExportsController.prototype[name as keyof AdminExportsController] as unknown as Handler;
      if (typeof fn !== 'function') continue;
      expect(Boolean(Reflect.getMetadata(STAFF_ONLY_KEY, fn) && Reflect.getMetadata(PERMISSION_KEY, fn))).toBe(false);
    }
  });
});

const EXPECTED_ALERTS: Record<string, AdminPermission> = {
  getUnreadCount: 'dashboard.read',
  getKpis: 'dashboard.read',
  getPreferences: 'dashboard.read',
  updatePreferences: 'dashboard.read',
  markAllAsRead: 'dashboard.read',
  markAsRead: 'dashboard.read',
  listAlerts: 'dashboard.read',
};

const reflectedAlerts = (): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const name of Object.getOwnPropertyNames(AdminAlertsController.prototype)) {
    const fn = AdminAlertsController.prototype[name as keyof AdminAlertsController] as unknown as Handler;
    if (name === 'constructor' || typeof fn !== 'function' || !Reflect.hasMetadata(PATH_METADATA, fn)) continue;
    out[name] = Reflect.getMetadata(STAFF_ONLY_KEY, fn) ? 'STAFF_ONLY' : Reflect.getMetadata(PERMISSION_KEY, fn);
  }
  return out;
};

describe('every AdminAlertsController route declares exactly its permission', () => {
  it('matches the enumerated table, handler by handler', () => {
    expect(reflectedAlerts()).toEqual(EXPECTED_ALERTS);
  });

  it('never marks a handler both staff-only and permissioned', () => {
    for (const name of Object.getOwnPropertyNames(AdminAlertsController.prototype)) {
      const fn = AdminAlertsController.prototype[name as keyof AdminAlertsController] as unknown as Handler;
      if (typeof fn !== 'function') continue;
      expect(Boolean(Reflect.getMetadata(STAFF_ONLY_KEY, fn) && Reflect.getMetadata(PERMISSION_KEY, fn))).toBe(false);
    }
  });
});

const EXPECTED_CONVERSATIONS: Record<string, AdminPermission> = {
  getKpis: 'conversations.read',
  closeConversation: 'content.moderate',
  reopenConversation: 'content.moderate',
  getDetail: 'conversations.read',
  list: 'conversations.read',
};

const reflectedConversations = (): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const name of Object.getOwnPropertyNames(AdminConversationsController.prototype)) {
    const fn = AdminConversationsController.prototype[name as keyof AdminConversationsController] as unknown as Handler;
    if (name === 'constructor' || typeof fn !== 'function' || !Reflect.hasMetadata(PATH_METADATA, fn)) continue;
    out[name] = Reflect.getMetadata(STAFF_ONLY_KEY, fn) ? 'STAFF_ONLY' : Reflect.getMetadata(PERMISSION_KEY, fn);
  }
  return out;
};

describe('every AdminConversationsController route declares exactly its permission', () => {
  it('matches the enumerated table, handler by handler', () => {
    expect(reflectedConversations()).toEqual(EXPECTED_CONVERSATIONS);
  });

  it('never marks a handler both staff-only and permissioned', () => {
    for (const name of Object.getOwnPropertyNames(AdminConversationsController.prototype)) {
      const fn = AdminConversationsController.prototype[name as keyof AdminConversationsController] as unknown as Handler;
      if (typeof fn !== 'function') continue;
      expect(Boolean(Reflect.getMetadata(STAFF_ONLY_KEY, fn) && Reflect.getMetadata(PERMISSION_KEY, fn))).toBe(false);
    }
  });
});

const EXPECTED_SETTINGS: Record<string, AdminPermission> = {
  getSettings: 'dashboard.read',
  updateSettings: 'admin.manage',
};

const reflectedSettings = (): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const name of Object.getOwnPropertyNames(AdminSettingsController.prototype)) {
    const fn = AdminSettingsController.prototype[name as keyof AdminSettingsController] as unknown as Handler;
    if (name === 'constructor' || typeof fn !== 'function' || !Reflect.hasMetadata(PATH_METADATA, fn)) continue;
    out[name] = Reflect.getMetadata(STAFF_ONLY_KEY, fn) ? 'STAFF_ONLY' : Reflect.getMetadata(PERMISSION_KEY, fn);
  }
  return out;
};

describe('every AdminSettingsController route declares exactly its permission', () => {
  it('matches the enumerated table, handler by handler', () => {
    expect(reflectedSettings()).toEqual(EXPECTED_SETTINGS);
  });

  it('never marks a handler both staff-only and permissioned', () => {
    for (const name of Object.getOwnPropertyNames(AdminSettingsController.prototype)) {
      const fn = AdminSettingsController.prototype[name as keyof AdminSettingsController] as unknown as Handler;
      if (typeof fn !== 'function') continue;
      expect(Boolean(Reflect.getMetadata(STAFF_ONLY_KEY, fn) && Reflect.getMetadata(PERMISSION_KEY, fn))).toBe(false);
    }
  });
});




