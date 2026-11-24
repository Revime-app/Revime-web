import { describe, it, expect } from 'vitest';
import {
  payoutStatusSchema,
  connectAccountStatusSchema,
  adminPayoutListQuerySchema,
  adminPayoutListItemSchema,
  adminPayoutListResponseSchema,
  adminIncompleteAccountsQuerySchema,
  adminIncompleteConnectAccountSchema,
  adminIncompleteAccountsResponseSchema,
  adminPayoutKpisSchema,
} from '../src/payout.schemas.js';

import * as SharedIndex from '../src/index.js';

describe('Payout Schemas (@revime/shared)', () => {
  describe('Index re-exports', () => {
    it('exports all payout schemas from root index', () => {
      expect(SharedIndex.payoutStatusSchema).toBe(payoutStatusSchema);
      expect(SharedIndex.connectAccountStatusSchema).toBe(connectAccountStatusSchema);
      expect(SharedIndex.adminPayoutListQuerySchema).toBe(adminPayoutListQuerySchema);
      expect(SharedIndex.adminPayoutListItemSchema).toBe(adminPayoutListItemSchema);
      expect(SharedIndex.adminPayoutListResponseSchema).toBe(adminPayoutListResponseSchema);
      expect(SharedIndex.adminIncompleteAccountsQuerySchema).toBe(adminIncompleteAccountsQuerySchema);
      expect(SharedIndex.adminIncompleteConnectAccountSchema).toBe(adminIncompleteConnectAccountSchema);
      expect(SharedIndex.adminIncompleteAccountsResponseSchema).toBe(adminIncompleteAccountsResponseSchema);
      expect(SharedIndex.adminPayoutKpisSchema).toBe(adminPayoutKpisSchema);
    });
  });
  describe('Status Enums', () => {
    it('validates payout statuses', () => {
      expect(payoutStatusSchema.parse('TRANSFERRED')).toBe('TRANSFERRED');
      expect(payoutStatusSchema.parse('PENDING')).toBe('PENDING');
      expect(payoutStatusSchema.parse('FAILED')).toBe('FAILED');
      expect(payoutStatusSchema.parse('REVERSED')).toBe('REVERSED');
      expect(() => payoutStatusSchema.parse('INVALID')).toThrow();
    });

    it('validates connect account statuses', () => {
      expect(connectAccountStatusSchema.parse('PENDING')).toBe('PENDING');
      expect(connectAccountStatusSchema.parse('VERIFIED')).toBe('VERIFIED');
      expect(connectAccountStatusSchema.parse('RESTRICTED')).toBe('RESTRICTED');
      expect(connectAccountStatusSchema.parse('REJECTED')).toBe('REJECTED');
      expect(() => connectAccountStatusSchema.parse('UNKNOWN')).toThrow();
    });
  });

  describe('adminPayoutListQuerySchema', () => {
    it('provides defaults and coerces numbers', () => {
      const parsed = adminPayoutListQuerySchema.parse({});
      expect(parsed.status).toBe('ALL');
      expect(parsed.period).toBe('all');
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(25);
    });

    it('coerces and parses filter parameters', () => {
      const parsed = adminPayoutListQuerySchema.parse({
        q: '  cmd-123  ',
        status: 'FAILED',
        period: '7d',
        page: '2',
        limit: '50',
      });
      expect(parsed.q).toBe('cmd-123');
      expect(parsed.status).toBe('FAILED');
      expect(parsed.period).toBe('7d');
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
    });

    it('validates datetime filters and enforces limit ceiling', () => {
      const parsed = adminPayoutListQuerySchema.parse({
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-16T23:59:59.999Z',
      });
      expect(parsed.startDate).toBe('2026-10-01T00:00:00.000Z');
      expect(parsed.endDate).toBe('2026-10-16T23:59:59.999Z');

      expect(() =>
        adminPayoutListQuerySchema.parse({
          limit: 101,
        }),
      ).toThrow();

      expect(() =>
        adminPayoutListQuerySchema.parse({
          page: 0,
        }),
      ).toThrow();
    });
  });

  describe('adminPayoutListItemSchema & adminPayoutListResponseSchema', () => {
    it('validates a complete payout item and list response', () => {
      const item = {
        id: 'cmd-999',
        orderNumber: 'CMD-999',
        createdAt: '2026-10-16T10:00:00.000Z',
        paidAt: '2026-10-16T10:05:00.000Z',
        releasedAt: '2026-10-16T11:00:00.000Z',
        amountCents: 8500,
        totalOrderCents: 10000,
        commissionCents: 1500,
        status: 'TRANSFERRED',
        repairerId: 'usr-rep-1',
        repairerName: 'Alex Réparations',
        repairerEmail: 'alex@repareme.fr',
        stripeAccountId: 'acct_123',
        transfersActive: true,
        stripeTransferId: 'tr_123',
        stripeChargeId: 'ch_123',
        failureReason: null,
        canRetry: false,
      };
      const parsed = adminPayoutListItemSchema.parse(item);
      expect(parsed.amountCents).toBe(8500);
      expect(parsed.canRetry).toBe(false);

      const response = {
        items: [parsed],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      };
      expect(adminPayoutListResponseSchema.parse(response)).toEqual(response);
    });

    it('rejects invalid item structures', () => {
      expect(() =>
        adminPayoutListItemSchema.parse({
          id: 'cmd-1',
          status: 'UNKNOWN_STATUS',
        }),
      ).toThrow();
    });
  });

  describe('adminIncompleteAccountsQuerySchema', () => {
    it('provides defaults and coerces numbers', () => {
      const parsed = adminIncompleteAccountsQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(25);
    });

    it('validates search query and enforces limits', () => {
      const parsed = adminIncompleteAccountsQuerySchema.parse({
        q: '  jean  ',
        page: '3',
        limit: '10',
      });
      expect(parsed.q).toBe('jean');
      expect(parsed.page).toBe(3);
      expect(parsed.limit).toBe(10);

      expect(() =>
        adminIncompleteAccountsQuerySchema.parse({
          limit: 150,
        }),
      ).toThrow();
    });
  });

  describe('adminIncompleteConnectAccountSchema & adminIncompleteAccountsResponseSchema', () => {
    it('validates an incomplete connect account entry and response', () => {
      const account = {
        id: 'conn-1',
        userId: 'usr-rep-2',
        repairerName: 'Jean Express',
        repairerEmail: 'jean@test.com',
        stripeAccountId: 'acct_456',
        status: 'RESTRICTED',
        transfersActive: false,
        disabledReason: 'requirements.past_due',
        pendingPayoutsCount: 2,
        pendingPayoutsTotalCents: 17000,
        createdAt: '2026-10-10T12:00:00.000Z',
        lastSyncedAt: '2026-10-16T08:00:00.000Z',
      };
      const parsed = adminIncompleteConnectAccountSchema.parse(account);
      expect(parsed.transfersActive).toBe(false);
      expect(parsed.pendingPayoutsTotalCents).toBe(17000);

      const response = {
        items: [parsed],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      };
      expect(adminIncompleteAccountsResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('adminPayoutKpisSchema', () => {
    it('validates payout metrics', () => {
      const kpis = {
        totalTransferredCents: 2450000,
        pendingEscrowCents: 185000,
        failedTransfersCount: 3,
        incompleteAccountsCount: 5,
      };
      expect(adminPayoutKpisSchema.parse(kpis)).toEqual(kpis);
    });

    it('rejects negative counts or amounts in KPIs', () => {
      expect(() =>
        adminPayoutKpisSchema.parse({
          totalTransferredCents: -100,
          pendingEscrowCents: 0,
          failedTransfersCount: 0,
          incompleteAccountsCount: 0,
        }),
      ).toThrow();
    });
  });
});
