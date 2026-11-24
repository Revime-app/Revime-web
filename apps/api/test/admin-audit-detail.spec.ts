import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AdminAuditInterceptor } from '../src/admin/admin-audit.interceptor.js';
import { AdminAuditService } from '../src/admin/admin-audit.service.js';
import { AUDIT_KEY, type AuditMeta } from '../src/admin/admin-audit.decorator.js';

const makeReflector = (meta: AuditMeta | undefined) => ({
  get: vi.fn((key: string) => (key === AUDIT_KEY ? meta : undefined)),
});

const makeAuditService = () => ({
  record: vi.fn().mockResolvedValue(undefined),
  list: vi.fn(),
});

const makeContext = (meta: AuditMeta | undefined, req: Record<string, unknown>) => {
  const reflector = makeReflector(meta);
  const handler = vi.fn();
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
  return { reflector, context };
};

describe('AdminAuditInterceptor detail handling', () => {
  it('copies only the named body fields into detail, and caps their length', async () => {
    const meta: AuditMeta = {
      action: 'user.delete',
      targetType: 'User',
      detailFields: ['reason'],
    };
    const req = {
      session: { user: { id: 'u1', email: 'admin@revime.fr' } },
      body: {
        reason: 'spam account',
        secret: 'this-should-not-appear',
        password: 'hunter2',
      },
    };

    const { reflector, context } = makeContext(meta, req);
    const auditService = makeAuditService();
    const interceptor = new AdminAuditInterceptor(
      reflector as unknown as Reflector,
      auditService as unknown as AdminAuditService,
    );

    const handler = { handle: () => of({ ok: true }) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe(() => resolve());
    });

    expect(auditService.record).toHaveBeenCalledTimes(1);
    const call = auditService.record.mock.calls[0]![0];
    expect(call.detail).toEqual({ reason: 'spam account' });
    expect(call.detail).not.toHaveProperty('secret');
    expect(call.detail).not.toHaveProperty('password');
  });

  it('truncates a long detail field to 300 characters', async () => {
    const longReason = 'x'.repeat(400);
    const meta: AuditMeta = {
      action: 'user.delete',
      detailFields: ['reason'],
    };
    const req = {
      session: { user: { id: 'u1', email: 'admin@revime.fr' } },
      body: { reason: longReason },
    };

    const { reflector, context } = makeContext(meta, req);
    const auditService = makeAuditService();
    const interceptor = new AdminAuditInterceptor(
      reflector as unknown as Reflector,
      auditService as unknown as AdminAuditService,
    );

    const handler = { handle: () => of({ ok: true }) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe(() => resolve());
    });

    const call = auditService.record.mock.calls[0]![0];
    expect(call.detail?.reason).toHaveLength(300);
    expect(call.detail?.reason).toBe('x'.repeat(300));
  });

  it('writes detail as null when the handler names no fields', async () => {
    const meta: AuditMeta = {
      action: 'review.delete',
      targetType: 'Review',
      // detailFields omitted, the piece-A case
    };
    const req = {
      session: { user: { id: 'u1', email: 'admin@revime.fr' } },
      body: { something: 'here' },
    };

    const { reflector, context } = makeContext(meta, req);
    const auditService = makeAuditService();
    const interceptor = new AdminAuditInterceptor(
      reflector as unknown as Reflector,
      auditService as unknown as AdminAuditService,
    );

    const handler = { handle: () => of({ ok: true }) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe(() => resolve());
    });

    expect(auditService.record).toHaveBeenCalledTimes(1);
    const call = auditService.record.mock.calls[0]![0];
    expect(call.detail).toBeNull();
  });

  it('omits missing or null body fields rather than writing them', async () => {
    const meta: AuditMeta = {
      action: 'user.delete',
      detailFields: ['reason', 'missing', 'nullField'],
    };
    const req = {
      session: { user: { id: 'u1', email: 'admin@revime.fr' } },
      body: { reason: 'ok', nullField: null },
    };

    const { reflector, context } = makeContext(meta, req);
    const auditService = makeAuditService();
    const interceptor = new AdminAuditInterceptor(
      reflector as unknown as Reflector,
      auditService as unknown as AdminAuditService,
    );

    const handler = { handle: () => of({ ok: true }) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe(() => resolve());
    });

    const call = auditService.record.mock.calls[0]![0];
    expect(call.detail).toEqual({ reason: 'ok' });
    expect(call.detail).not.toHaveProperty('missing');
    expect(call.detail).not.toHaveProperty('nullField');
  });

  it('coerces non-string values to strings', async () => {
    const meta: AuditMeta = {
      action: 'user.moderate',
      detailFields: ['count', 'flag'],
    };
    const req = {
      session: { user: { id: 'u1', email: 'admin@revime.fr' } },
      body: { count: 42, flag: true },
    };

    const { reflector, context } = makeContext(meta, req);
    const auditService = makeAuditService();
    const interceptor = new AdminAuditInterceptor(
      reflector as unknown as Reflector,
      auditService as unknown as AdminAuditService,
    );

    const handler = { handle: () => of({ ok: true }) };
    await new Promise<void>((resolve) => {
      interceptor.intercept(context, handler).subscribe(() => resolve());
    });

    const call = auditService.record.mock.calls[0]![0];
    expect(call.detail).toEqual({ count: '42', flag: 'true' });
  });

  it('writes detail on error paths too, so a refused action carries its reason', async () => {
    const meta: AuditMeta = {
      action: 'user.delete',
      detailFields: ['reason'],
    };
    const req = {
      session: { user: { id: 'u1', email: 'admin@revime.fr' } },
      body: { reason: 'attempted' },
    };

    const { reflector, context } = makeContext(meta, req);
    const auditService = makeAuditService();
    const interceptor = new AdminAuditInterceptor(
      reflector as unknown as Reflector,
      auditService as unknown as AdminAuditService,
    );

    const handler = { handle: () => throwError(() => new Error('forbidden')) };
    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, handler).subscribe({
        error: () => resolve(), // We expect an error, that's the test
      });
    });

    expect(auditService.record).toHaveBeenCalledTimes(1);
    const call = auditService.record.mock.calls[0]![0];
    expect(call.detail).toEqual({ reason: 'attempted' });
    expect(call.statusCode).toBe(500);
  });
});
