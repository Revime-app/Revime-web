import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminAuditInterceptor } from '../src/admin/admin-audit.interceptor.js';
import { AUDIT_KEY, type AuditMeta } from '../src/admin/admin-audit.decorator.js';
import type { AdminAuditService } from '../src/admin/admin-audit.service.js';

type AuditRecordInput = {
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  statusCode: number;
  detail?: Record<string, unknown> | null;
};

const makeExecutionContext = (
  auditMeta: AuditMeta | undefined,
  req: { session?: { user?: { id?: string; email?: string } }; params?: Record<string, string> },
  res: { statusCode?: number },
) => {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
};

describe('AdminAuditInterceptor', () => {
  let interceptor: AdminAuditInterceptor;
  let reflector: Reflector;
  let auditService: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    reflector = { get: vi.fn() } as any;
    auditService = { record: vi.fn().mockResolvedValue(undefined) };
    interceptor = new AdminAuditInterceptor(reflector, auditService as any);
  });

  it('does not audit when no @Audit metadata is present, and the handler still runs', async () => {
    reflector.get = vi.fn().mockReturnValue(undefined);
    const context = makeExecutionContext(undefined, {}, {});
    const handler = { handle: vi.fn().mockReturnValue(of('result')) };

    const result = await interceptor.intercept(context, handler).toPromise();

    expect(result).toBe('result');
    expect(auditService.record).not.toHaveBeenCalled();
    expect(handler.handle).toHaveBeenCalled();
  });

  it('records the actor role from the session, and null when absent (CF4-40)', async () => {
    const meta: AuditMeta = { action: 'commande.refund' };
    reflector.get = vi.fn().mockReturnValue(meta);
    const handler = { handle: vi.fn().mockReturnValue(of('ok')) };

    const withRole = { session: { user: { id: 'u9', email: 'fin@revime.fr', role: 'finance' } } };
    await interceptor.intercept(makeExecutionContext(meta, withRole as never, { statusCode: 200 }), handler).toPromise();
    expect(auditService.record.mock.calls[0]![0]).toMatchObject({ actorRole: 'finance' });

    const noRole = { session: { user: { id: 'u8', email: 'x@revime.fr' } } };
    await interceptor.intercept(makeExecutionContext(meta, noRole, { statusCode: 200 }), handler).toPromise();
    expect(auditService.record.mock.calls[1]![0]).toMatchObject({ actorRole: null });
  });

  it('audits a successful action with statusCode from the response object, not hardcoded', async () => {
    const meta: AuditMeta = { action: 'commande.refund' };
    reflector.get = vi.fn().mockReturnValue(meta);
    const req = { session: { user: { id: 'u1', email: 'admin@revime.fr' } } };
    const res = { statusCode: 200 };
    const context = makeExecutionContext(meta, req, res);
    const handler = { handle: vi.fn().mockReturnValue(of('success')) };

    await interceptor.intercept(context, handler).toPromise();

    expect(auditService.record).toHaveBeenCalledWith({
      actorUserId: 'u1',
      actorEmail: 'admin@revime.fr',
      actorRole: null,
      action: 'commande.refund',
      targetType: null,
      targetId: null,
      statusCode: 200,
      detail: null,
    });
  });

  it('audits a failed action with the thrown exception status, and the error still propagates', async () => {
    const meta: AuditMeta = { action: 'commande.parcel.issue_labels' };
    reflector.get = vi.fn().mockReturnValue(meta);
    const req = { session: { user: { id: 'u2', email: 'op@revime.fr' } } };
    const context = makeExecutionContext(meta, req, {});
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    const handler = { handle: vi.fn().mockReturnValue(throwError(() => exception)) };

    let thrown: any;
    try {
      await interceptor.intercept(context, handler).toPromise();
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBe(exception);
    expect(auditService.record).toHaveBeenCalledWith({
      actorUserId: 'u2',
      actorEmail: 'op@revime.fr',
      actorRole: null,
      action: 'commande.parcel.issue_labels',
      targetType: null,
      targetId: null,
      statusCode: 404,
      detail: null,
    });
  });

  it('reads targetId from req.params[meta.targetParam]', async () => {
    const meta: AuditMeta = { action: 'report.resolve', targetType: 'ConversationReport', targetParam: 'id' };
    reflector.get = vi.fn().mockReturnValue(meta);
    const req = { session: { user: { id: 'u3', email: 'mod@revime.fr' } }, params: { id: 'cr123' } };
    const res = { statusCode: 200 };
    const context = makeExecutionContext(meta, req, res);
    const handler = { handle: vi.fn().mockReturnValue(of(null)) };

    await interceptor.intercept(context, handler).toPromise();

    expect(auditService.record).toHaveBeenCalledWith({
      actorUserId: 'u3',
      actorEmail: 'mod@revime.fr',
      actorRole: null,
      action: 'report.resolve',
      targetType: 'ConversationReport',
      targetId: 'cr123',
      statusCode: 200,
      detail: null,
    });
  });
});
