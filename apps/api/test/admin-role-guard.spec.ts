import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminRoleGuard } from '../src/admin/admin-role.guard.js';
import { RequirePermission, StaffOnly } from '../src/admin/require-permission.decorator.js';

/**
 * CF4-40 / CF4-41, spec §4.2. First failure wins: staff role → second factor on the session →
 * the handler's permission. Deny by default. Review Focus 1: a staff session with no
 * `twoFactorVerifiedAt` (email code, Apple, Google) reaches nothing but `admin/me`.
 */

class Fixture {
  @RequirePermission('refunds.issue')
  refund() {}
  @RequirePermission('dashboard.read')
  read() {}
  @StaffOnly()
  me() {}
  bare() {}
}

type SessionShape = { user?: { role?: string | null }; session?: { twoFactorVerifiedAt?: Date | null } } | undefined;

const ctxFor = (handler: keyof Fixture, session: SessionShape) =>
  ({
    getHandler: () => Fixture.prototype[handler],
    getClass: () => Fixture,
    switchToHttp: () => ({ getRequest: () => ({ session }) }),
  }) as unknown as ExecutionContext;

const guard = new AdminRoleGuard(new Reflector());
const verified = (role: string | null) => ({ user: { role }, session: { twoFactorVerifiedAt: new Date() } });
const unverified = (role: string | null) => ({ user: { role }, session: { twoFactorVerifiedAt: null } });

const refusal = (handler: keyof Fixture, session: SessionShape): string | null => {
  try {
    guard.canActivate(ctxFor(handler, session));
    return null;
  } catch (e) {
    const err = e as { getStatus?: () => number; message: string };
    expect(err.getStatus?.()).toBe(403);
    return err.message;
  }
};

const NOT_STAFF = "Accès réservé à l'équipe Revime.";
const NO_2FA = 'Double authentification requise.';
const NOT_ALLOWED = 'Action non autorisée pour votre rôle.';

describe('AdminRoleGuard', () => {
  it.each([undefined, { user: {} }, verified(null), verified('user'), verified('admin_old')])(
    'refuses a non-staff session (%j)',
    (session) => {
      expect(refusal('read', session as SessionShape)).toBe(NOT_STAFF);
    },
  );

  it('refuses a staff session without a second factor, before any permission check', () => {
    expect(refusal('read', unverified('super_admin'))).toBe(NO_2FA);
    expect(refusal('refund', unverified('read_only'))).toBe(NO_2FA);
    expect(refusal('read', { user: { role: 'admin' } })).toBe(NO_2FA);
  });

  it('refuses a verified staff session lacking the permission', () => {
    expect(refusal('refund', verified('read_only'))).toBe(NOT_ALLOWED);
    expect(refusal('refund', verified('support'))).toBe(NOT_ALLOWED);
  });

  it('lets an allowed, verified staff session through', () => {
    expect(refusal('refund', verified('finance'))).toBeNull();
    expect(refusal('read', verified('read_only'))).toBeNull();
  });

  it('refuses a handler that declares nothing (deny by default)', () => {
    expect(refusal('bare', verified('super_admin'))).toBe(NOT_ALLOWED);
  });

  it('lets @StaffOnly through a staff session without 2FA, still refusing non-staff', () => {
    expect(refusal('me', unverified('read_only'))).toBeNull();
    expect(refusal('me', verified('user'))).toBe(NOT_STAFF);
    expect(refusal('me', undefined)).toBe(NOT_STAFF);
  });
});
