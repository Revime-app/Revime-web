import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { AdminController } from '../src/admin/admin.controller.js';
import { AUDIT_KEY, type AuditMeta } from '../src/admin/admin-audit.decorator.js';

const WRITE_METHODS = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

type Handler = (...args: unknown[]) => unknown;

const handlers = () =>
  Object.getOwnPropertyNames(AdminController.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({
      name,
      fn: AdminController.prototype[name as keyof AdminController] as unknown as Handler,
    }))
    .filter(({ fn }) => typeof fn === 'function' && Reflect.hasMetadata(PATH_METADATA, fn));

describe('every AdminController write handler is audited', () => {
  it('finds the controller handlers at all, so an empty list cannot pass as coverage', () => {
    // 🛑 Without this, a reflection change that returns [] would make the suite green
    // while auditing nothing. A broken check reports "fine", which is the dangerous
    // direction.
    expect(handlers().length).toBeGreaterThanOrEqual(20);
  });

  /**
   * 🛑 ENUMERATED, NOT COUNTED. This said « at least the eleven writes that exist today » with a
   * comment reading « 7 from piece A + B1's four », and by the end of piece B2 there were
   * **fifteen** - while `>= 11` still passed, so no gate could ever see the number go stale.
   * That is this branch's standing practice, arrived at the hard way: a set was miscounted six
   * separate times on this piece and every one was BUMPED rather than measured. A list cannot go
   * stale the same way, and adding a write is now a visible diff here.
   *
   * Its job is still to stop the filter below passing on an empty set. It does that better:
   * `toEqual` on a sorted list catches a write DISAPPEARING too, which a `>=` never could.
   */
  const WRITE_HANDLERS = [
    // Piece A - §8.4 to §8.10
    'closeConversation',
    'deleteMessage',
    'issueLabels',
    'refund',
    'reopenConversation',
    'resolveReport',
    // Piece B1 - §8.2 / P6
    'addUserNote',
    'deleteUser',
    'moderateUser',
    'reactivateUser',
    'resetUserPassword',
    'sendFiscalReminder',
    'sendUserEmail',
    'suspendUser',
    // V7 A11 (U2)
    'unlockUserLogin',
    // Piece B2 - §8.3
    'reactivateRepairer',
    'restoreVerification',
    'revokeVerification',
    'suspendRepairer',
    // Piece C1 - §8.4
    'changeDemandeCategory',
    'deleteDemande',
    'hideDemande',
    'unhideDemande',
    // Piece C2 - §8.8
    'assignReport',
    'unassignReport',
    // Piece C3 - §8.5
    'moderateDeleteOffer',
    // Piece D - §8.7
    'addDisputeNote',
    'assignDispute',
    'openDispute',
    'resolveDismiss',
    'resolveRefund',
    'resolveRelease',
    'unassignDispute',
    // Piece E - §8.9
    'createBrand',
    'createCategory',
    'createModel',
    'deleteBrand',
    'deleteModel',
    'reorderCategories',
    'toggleCategoryActive',
    'updateBrand',
    'updateCategory',
    'updateModel',
    // Livraison Boxtal - spec §7.8
    'retryShipment',
    // CF4-D flexible refunds - spec §3, §7 (retry of an owed réparateur share)
    'payShare',
    // CF4-L « Conseils du jour » - spec §4.3
    'createTip',
    'deleteTip',
    'updateTip',
    // CF4-L « Avis » - spec §4.3 (replaces piece A's deleteReview, removed)
    'hideReview',
    'restoreReview',
    // CF4-M « Vérification d'identité » - spec §4.4
    'acceptIdentity',
    'refuseIdentity',
    'requestIdentityDocuments',
    // CF4-N « Administration - droits et sécurité » - spec §4.3, §4.4
    'changeRole',
    'resetTwoFactor',
    // CF4-27 (sub-project I), client cancellation - spec §4.4
    'refuseCancellation',
    'approveCancellation',
    // CF4-J §4.6
    'sendDisputeMessage',
    // CF5-09 (Staff Accounts & Email Invitation Flow)
    'inviteStaff',
    'revokeStaffInvitation',
    'resendStaffInvitation',
    'removeStaffMember',
    // CF5-07 (Business Verification Review)
    'approveBusiness',
    'refuseBusiness',
    'requestBusinessDocuments',
    // CF6-19 Compliance Audit Trail
    'verifyComplianceProof',
    // Bug B3: Cancel order without Stripe charge
    'cancelCommande',
    // P11: Abandon stale pending payments
    'abandonStalePayments',
    // P15: Dismiss attention queue anomaly
    'dismissAttention',
    // P16: Shipment operations
    'sendShipmentReminder',
    'createAdminShipment',
    // Feature F12 - Fault Types
    'createFaultType',
    'deleteFaultType',
    'reorderFaultTypes',
    'updateFaultType',
  ];

  it('finds exactly the write handlers that exist today, named', () => {
    const writes = handlers()
      .filter(({ name }) => name !== 'signDisputeAttachment')
      .filter(({ fn }) => WRITE_METHODS.has(Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod))
      .map(({ name }) => name)
      .sort();
    expect(writes).toEqual([...WRITE_HANDLERS].sort());
  });

  it('carries @Audit on every write, with an action', () => {
    const missing = handlers()
      .filter(({ name }) => name !== 'signDisputeAttachment')
      .filter(({ fn }) => WRITE_METHODS.has(Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod))
      .filter(({ fn }) => {
        const meta = Reflect.getMetadata(AUDIT_KEY, fn) as AuditMeta | undefined;
        return !meta?.action;
      })
      .map(({ name }) => name);

    expect(missing, `write handlers missing @Audit: ${missing.join(', ')}`).toEqual([]);
  });

  it('decorates dispute write handlers with their exact expected audit actions', () => {
    const expectedDisputeActions: Record<string, string> = {
      openDispute: 'dispute.open',
      assignDispute: 'dispute.assign',
      unassignDispute: 'dispute.unassign',
      addDisputeNote: 'dispute.note',
      resolveRelease: 'dispute.resolve_release',
      resolveRefund: 'dispute.resolve_refund',
      resolveDismiss: 'dispute.resolve_dismiss',
      sendDisputeMessage: 'dispute.message',
    };

    const actionMap = Object.fromEntries(
      handlers()
        .filter(({ name }) => name in expectedDisputeActions)
        .map(({ name, fn }) => {
          const meta = Reflect.getMetadata(AUDIT_KEY, fn) as AuditMeta | undefined;
          return [name, meta?.action];
        }),
    );

    expect(actionMap).toEqual(expectedDisputeActions);
  });

  it('decorates catalog write handlers with their exact expected audit actions', () => {
    const expectedCatalogActions: Record<string, string> = {
      createCategory: 'category.create',
      updateCategory: 'category.update',
      toggleCategoryActive: 'category.toggle_active',
      reorderCategories: 'category.reorder',
      createBrand: 'brand.create',
      updateBrand: 'brand.update',
      deleteBrand: 'brand.delete',
      createModel: 'model.create',
      updateModel: 'model.update',
      deleteModel: 'model.delete',
      createFaultType: 'fault_type.create',
      updateFaultType: 'fault_type.update',
      deleteFaultType: 'fault_type.delete',
      reorderFaultTypes: 'fault_type.reorder',
    };

    const actionMap = Object.fromEntries(
      handlers()
        .filter(({ name }) => name in expectedCatalogActions)
        .map(({ name, fn }) => {
          const meta = Reflect.getMetadata(AUDIT_KEY, fn) as AuditMeta | undefined;
          return [name, meta?.action];
        }),
    );

    expect(actionMap).toEqual(expectedCatalogActions);
  });

  it('decorates tip write handlers with their exact expected audit actions (CF4-L)', () => {
    const expected: Record<string, string> = {
      createTip: 'tip.create',
      updateTip: 'tip.update',
      deleteTip: 'tip.delete',
    };
    const actionMap = Object.fromEntries(
      handlers()
        .filter(({ name }) => name in expected)
        .map(({ name, fn }) => [name, (Reflect.getMetadata(AUDIT_KEY, fn) as AuditMeta | undefined)?.action]),
    );
    expect(actionMap).toEqual(expected);
  });

  it('decorates review write handlers with review.hide / review.restore, and the hide records motif and note (CF4-L)', () => {
    const metaOf = (name: string) =>
      Reflect.getMetadata(AUDIT_KEY, handlers().find((h) => h.name === name)!.fn) as AuditMeta;
    expect(metaOf('hideReview')).toEqual({
      action: 'review.hide',
      targetType: 'Review',
      targetParam: 'id',
      detailFields: ['motif', 'note'],
    });
    expect(metaOf('restoreReview')).toMatchObject({ action: 'review.restore', targetType: 'Review', targetParam: 'id' });
    expect(handlers().some((h) => h.name === 'deleteReview')).toBe(false);
  });

  it('decorates the identity decision handlers with their actions and detail fields (CF4-M)', () => {
    const metaOf = (name: string) =>
      Reflect.getMetadata(AUDIT_KEY, handlers().find((h) => h.name === name)!.fn) as AuditMeta;
    expect(metaOf('acceptIdentity')).toEqual({
      action: 'identity.accept',
      targetType: 'User',
      targetParam: 'id',
      detailFields: ['note'],
    });
    expect(metaOf('refuseIdentity')).toEqual({
      action: 'identity.refuse',
      targetType: 'User',
      targetParam: 'id',
      detailFields: ['motif', 'note'],
    });
    expect(metaOf('requestIdentityDocuments')).toEqual({
      action: 'identity.request_documents',
      targetType: 'User',
      targetParam: 'id',
      detailFields: ['motif', 'note'],
    });
  });

  it('decorates the staff handlers with their actions (CF4-N)', () => {
    const metaOf = (name: string) =>
      Reflect.getMetadata(AUDIT_KEY, handlers().find((h) => h.name === name)!.fn) as AuditMeta;
    expect(metaOf('changeRole')).toEqual({
      action: 'admin.role_change',
      targetType: 'User',
      targetParam: 'id',
      detailFields: ['role'],
    });
    expect(metaOf('resetTwoFactor')).toEqual({ action: 'admin.2fa_reset', targetType: 'User', targetParam: 'id' });
  });

  it('decorates sendDisputeMessage with dispute.message and detail field space (CF4-J)', () => {
    const metaOf = (name: string) =>
      Reflect.getMetadata(AUDIT_KEY, handlers().find((h) => h.name === name)!.fn) as AuditMeta;
    expect(metaOf('sendDisputeMessage')).toEqual({
      action: 'dispute.message',
      targetType: 'Dispute',
      targetParam: 'id',
      detailFields: ['space'],
    });
  });

  it('decorates the staff invitation handlers with their actions and details (CF5-09)', () => {
    const metaOf = (name: string) =>
      Reflect.getMetadata(AUDIT_KEY, handlers().find((h) => h.name === name)!.fn) as AuditMeta;
    expect(metaOf('inviteStaff')).toEqual({
      action: 'admin.staff_invite',
      targetType: 'StaffInvitation',
      detailFields: ['email', 'role'],
    });
    expect(metaOf('revokeStaffInvitation')).toEqual({
      action: 'admin.staff_invite_revoke',
      targetType: 'StaffInvitation',
      targetParam: 'id',
    });
    expect(metaOf('resendStaffInvitation')).toEqual({
      action: 'admin.staff_invite_resend',
      targetType: 'StaffInvitation',
      targetParam: 'id',
    });
    expect(metaOf('removeStaffMember')).toEqual({
      action: 'admin.staff_remove',
      targetType: 'User',
      targetParam: 'id',
    });
  });

  it('decorates the business decision handlers with their actions and details (CF5-07)', () => {
    const metaOf = (name: string) =>
      Reflect.getMetadata(AUDIT_KEY, handlers().find((h) => h.name === name)!.fn) as AuditMeta;
    expect(metaOf('approveBusiness')).toEqual({
      action: 'admin.business_verify_approve',
      targetType: 'User',
      targetParam: 'userId',
    });
    expect(metaOf('refuseBusiness')).toEqual({
      action: 'admin.business_verify_refuse',
      targetType: 'User',
      targetParam: 'userId',
      detailFields: ['motif', 'note'],
    });
    expect(metaOf('requestBusinessDocuments')).toEqual({
      action: 'admin.business_verify_request_documents',
      targetType: 'User',
      targetParam: 'userId',
      detailFields: ['motif', 'note'],
    });
  });

  it('decorates dismissAttention with attention.dismiss action and reason detail (P15)', () => {
    const metaOf = (name: string) =>
      Reflect.getMetadata(AUDIT_KEY, handlers().find((h) => h.name === name)!.fn) as AuditMeta;
    expect(metaOf('dismissAttention')).toEqual({
      action: 'attention.dismiss',
      targetType: 'Commande',
      targetParam: 'id',
      detailFields: ['reason'],
    });
  });
});
