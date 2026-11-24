import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, type AuditMeta } from './admin-audit.decorator.js';
import { AdminAuditService } from './admin-audit.service.js';

type AuditedRequest = {
  session?: { user?: { id?: string; email?: string; role?: string | null } };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
};

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AdminAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    // Reads carry no @Audit. Ch.8 asks for actions to be historisé, and logging every GET
    // would bury the writes that matter.
    if (!meta) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<AuditedRequest>();
    const actorUserId = req.session?.user?.id ?? null;
    const actorEmail = req.session?.user?.email ?? null;
    const actorRole = req.session?.user?.role ?? null;
    const targetId = meta.targetParam ? (req.params?.[meta.targetParam] ?? null) : null;

    /**
     * 🛑 This reads the RAW req.body, not the handler's Zod-parsed argument - a pipe
     * transforms the argument, not the request. So the value is UNVALIDATED: coerce to
     * string and cap it, because an audit column is a poor place to store an arbitrary
     * payload. A missing or empty key is omitted rather than written as null.
     */
    const detail = (() => {
      if (!meta.detailFields?.length) return null;
      const out: Record<string, string> = {};
      for (const key of meta.detailFields) {
        const raw = req.body?.[key];
        if (raw === undefined || raw === null) continue;
        const maxLen = key === 'content' || key === 'message' ? 5000 : 300;
        out[key] = String(raw).slice(0, maxLen);
      }
      return Object.keys(out).length > 0 ? out : null;
    })();

    const action =
      meta.action === 'category.create' && req.body?.parentId
        ? 'category.create_sub'
        : meta.action;

    const base = {
      actorUserId,
      actorEmail,
      actorRole,
      action,
      targetType: meta.targetType ?? null,
      targetId,
      detail,
    };

    return next.handle().pipe(
      tap({
        // Read the real response code: handlers here use @HttpCode(200) rather than Nest's
        // 201 default for POST, so hardcoding 200 would be right by accident.
        next: () => {
          const resolvedTargetId = meta.targetParam ? (req.params?.[meta.targetParam] ?? targetId) : targetId;
          void this.audit.record({ ...base, targetId: resolvedTargetId, statusCode: http.getResponse<{ statusCode?: number }>().statusCode ?? 200 });
        },
        // A refused action is exactly what an audit trail is for. 🛑 ONLY the handler's
        // refusals: Nest runs guards before interceptors, so AdminRoleGuard's 403 and the
        // global 401 never reach this and are never logged. Record, then let the error
        // propagate untouched - AllExceptionsFilter still shapes the response.
        error: (err: unknown) => {
          const resolvedTargetId = meta.targetParam ? (req.params?.[meta.targetParam] ?? targetId) : targetId;
          const statusCode = err instanceof HttpException ? err.getStatus() : 500;
          void this.audit.record({ ...base, targetId: resolvedTargetId, statusCode });
        },
      }),
    );
  }
}
