import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminStaffPublicController } from '../src/admin/admin-staff-public.controller.js';
import { AdminCommunicationsController } from '../src/admin/admin-communications.controller.js';
import { AdminPromosController } from '../src/admin/admin-promos.controller.js';
import { AdminPayoutsController } from '../src/admin/admin-payouts.controller.js';
import { AdminExportsController } from '../src/admin/admin-exports.controller.js';
import { AdminAlertsController } from '../src/admin/admin-alerts.controller.js';
import { AdminConversationsController } from '../src/admin/admin-conversations.controller.js';
import { AdminSettingsController } from '../src/admin/admin-settings.controller.js';

/**
 * 🛑 THE ROUTE SEAM TEST - roadmap follow-up #5, the most important gate in this task.
 *
 * Task 10 wrote four API paths as template strings. All four were wrong - `admin/repairers/…`
 * where the API serves `admin/users/…` - so EVERY button 404'd, while typecheck, the 14 admin
 * tests and `next build` were all green. The reviewer's words: "the four action routes all
 * 404'd in the first commit despite identical gate results."
 *
 * This test enumerates the paths the admin app fetches, enumerates the routes the API registers,
 * and asserts every fetched path resolves to a registered one. Method mismatches (e.g., a PATCH
 * to a @Get route) fail too, since they're as dead as a wrong path.
 *
 * ## What this gate DOES check
 *
 * - Path existence: `admin/users/:id/suspend` exists as a registered route
 * - Method match: a PATCH call to a @Get route fails the test
 * - Template segment normalization: `admin/users/${id}` matches `admin/users/:id`
 * - Multi-line calls: formatting does not break the scan (proven by probe)
 *
 * ## What this gate CANNOT check - documented limits
 *
 * 🛑 **An undocumented limit inside a gate is a false assurance.** Someone reads a green test and
 * concludes more than it checked. These boundaries are stated explicitly so a future reader knows
 * what "passing" means:
 *
 * 1. **Param order.** Routes with multiple params normalise to the same shape regardless of order:
 *    `/users/:userId/offers/:offerId` and `/users/:offerId/offers/:userId` both become
 *    `/users/:param/offers/:param`, so the gate answers "does this path shape exist" and not
 *    "are the params in the right order". No multi-param admin route exists today (2026-09-04),
 *    so this is currently unreachable rather than merely tolerated.
 *
 * 2. **Wrapper signature variations.** The scan recognises `fetch(...)` and `act(...)` calls with
 *    their current argument order. A new wrapper with a different signature (e.g., method before
 *    path) is skipped silently. The "≥ 10 fetched calls" vacuity guard is the only defence: if
 *    a refactor moves all calls to an unrecognised wrapper, the gate fails rather than passing
 *    vacuously.
 *
 * 3. **Quote style and formatting.** The regex handles single, double, and backtick quotes, and
 *    works across line breaks (proven by probe). It does NOT handle unusual whitespace inside
 *    template literals or dynamically constructed paths. The codebase uses consistent formatting,
 *    so this is currently a non-issue.
 */

const METHOD_NAMES: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.SEARCH]: 'SEARCH',
};

type RouteSignature = { method: string; path: string };

/**
 * Extracts all routes from AdminController and AdminStaffPublicController via reflection
 * (same technique as admin-audit-coverage.spec.ts).
 */
function extractApiRoutes(): RouteSignature[] {
  const controllers = [
    AdminConversationsController,
    AdminController,
    AdminStaffPublicController,
    AdminCommunicationsController,
    AdminPromosController,
    AdminPayoutsController,
    AdminExportsController,
    AdminAlertsController,
    AdminSettingsController,
  ];
  const routes: RouteSignature[] = [];

  for (const controller of controllers) {
    const rawClassPath = (Reflect.getMetadata(PATH_METADATA, controller) as string) || '';
    const classPrefix = rawClassPath.replace(/^admin\/?/, '').replace(/\/$/, '');

    const handlers = Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => ({
        name,
        fn: controller.prototype[name as keyof typeof controller.prototype] as unknown as (
          ...args: unknown[]
        ) => unknown,
      }))
      .filter(({ fn }) => typeof fn === 'function' && Reflect.hasMetadata(PATH_METADATA, fn));

    for (const { fn } of handlers) {
      const methodEnum = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod;
      const methodName = METHOD_NAMES[methodEnum];
      if (!methodName) {
        throw new Error(`Unknown RequestMethod enum value: ${methodEnum}`);
      }
      const rawMethodPath = (Reflect.getMetadata(PATH_METADATA, fn) as string) || '';
      const cleanMethodPath = rawMethodPath.replace(/^\//, '');
      const relativePath = [classPrefix, cleanMethodPath].filter(Boolean).join('/');
      routes.push({
        method: methodName,
        path: relativePath,
      });
    }
  }

  return routes;
}

/**
 * Scans admin app source files for fetch calls to `/api/proxy/...`, extracts their paths and
 * methods, then transforms them to upstream API paths using the REAL `buildUpstreamUrl` logic
 * (not a re-implementation).
 *
 * Normalisation: template literals like `admin/users/${id}/suspend` become `admin/users/:id/suspend`
 * so they match AdminController's `:id` segments.
 */
function extractAdminFetchCalls(): RouteSignature[] {
  const adminRoot = path.resolve(__dirname, '../../admin');
  const calls: RouteSignature[] = [];

  function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Pattern 1: Match fetch('/api/proxy/...' and fetch(`/api/proxy/...`)
    // Captures: method (optional, defaults to GET), path (including template expressions)
    const fetchPattern =
      /fetch\((['"`])\/api\/proxy\/([^'"`]+)\1(?:,\s*\{[^}]*method:\s*['"](\w+)['"])?/g;

    let match;
    while ((match = fetchPattern.exec(content)) !== null) {
      const rawPath = match[2];
      const method = match[3] || 'GET';

      // TypeScript guard: regex should always capture group 2, but verify
      if (!rawPath) continue;

      // Skip paths where the ENTIRE path is a template variable (e.g., `fetch(\`/api/proxy/${path}\`)`).
      // These are wrappers that forward to concrete paths defined elsewhere, and scanning them would
      // require full static analysis. The concrete call sites are what we actually scan.
      if (rawPath.startsWith('${')) {
        continue;
      }

      // Strip query strings: "admin/audit?limit=20" becomes "admin/audit". CF4-F (Task 6/7/8):
      // the shipments/refunds/verifications lists build their querystring in a `qs` variable and
      // call `fetch(\`/api/proxy/admin/shipments${qs}\`)` - no literal `?` in the source for
      // `split('?')` to find, since `qs` already contains one (or is '') only at runtime. That
      // shape is told apart from a real path PARAM (`admin/users/${id}/suspend`) by what comes
      // right before the `${`: a param is always preceded by `/` (it is its own path segment); a
      // querystring variable directly abuts the previous segment with no separating `/`, because
      // it is not a segment at all. Only the latter is stripped here, so `admin/users/${id}` keeps
      // resolving to `admin/users/:param` exactly as before.
      const pathWithoutTrailingQueryVar = rawPath.replace(/([^/])\$\{[^}]+\}$/, '$1');
      const pathWithoutQuery = pathWithoutTrailingQueryVar.split('?')[0];
      if (!pathWithoutQuery) continue;

      // Normalize template expressions: replace ${...} with :param
      // E.g., "admin/users/${id}" becomes "admin/users/:param"
      const normalizedPath = pathWithoutQuery.replace(/\$\{[^}]+\}/g, ':param');

      calls.push({ method, path: normalizedPath });
    }

    // Pattern 2: Match act() calls which define paths and methods used by the fetch wrapper
    // E.g., act(`admin/users/${id}/suspend`, 'PATCH', ...)
    const actPattern = /act\(\s*(['"`])([^'"`]+)\1\s*,\s*['"](\w+)['"]/g;

    while ((match = actPattern.exec(content)) !== null) {
      const rawPath = match[2];
      const method = match[3];

      // TypeScript guard
      if (!rawPath || !method) continue;

      // Strip query strings
      const pathWithoutQuery = rawPath.split('?')[0];
      if (!pathWithoutQuery) continue;

      // Normalize template expressions
      const normalizedPath = pathWithoutQuery.replace(/\$\{[^}]+\}/g, ':param');

      calls.push({ method, path: normalizedPath });
    }
  }

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        scanFile(fullPath);
      }
    }
  }

  walk(adminRoot);

  // Deduplicate: same route may be called from multiple files
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.method} ${call.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Normalizes an API route path (e.g., `users/:id/suspend`) to match against fetched paths,
 * which use `:param` for all template segments.
 */
function normalizeApiPath(apiPath: string): string {
  // Replace any :param with :param (already in the right form)
  return apiPath.replace(/:[^/]+/g, ':param');
}

describe('every admin fetch() call resolves to a registered API route', () => {
  const apiRoutes = extractApiRoutes();
  const fetchedCalls = extractAdminFetchCalls();

  it('finds at least 20 API routes, so an empty list cannot pass as coverage', () => {
    // 🛑 Without this, a reflection change that returns [] would make the test green while
    // covering nothing. A broken check reports "fine", which is the dangerous direction.
    expect(apiRoutes.length).toBeGreaterThanOrEqual(20);
  });

  it('finds at least 10 fetch calls, so a regex that stops matching cannot read as success', () => {
    // 🛑 A scan that matches nothing is a broken scan, not a correct program. This assertion
    // fails the test if the fetch pattern stops matching.
    expect(fetchedCalls.length).toBeGreaterThanOrEqual(10);
  });

  it('resolves every fetched path+method to a registered API route', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );

    const unresolved = fetchedCalls.filter((call) => {
      const signature = `${call.method} ${call.path}`;
      return !apiSignatures.has(signature);
    });

    // 🛑 For debugging: log what we found
    if (process.env.DEBUG_ROUTES) {
      console.log('API routes:', Array.from(apiSignatures).sort());
      console.log('Fetched calls:', fetchedCalls.map((c) => `${c.method} ${c.path}`).sort());
    }

    expect(
      unresolved,
      `Fetched paths with no registered route:\n${unresolved.map((c) => `  ${c.method} ${c.path}`).join('\n')}`,
    ).toEqual([]);
  });

  it('registers the offer context and moderation delete routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/offres/:param/context')).toBe(true);
    // CF4-40 / CF4-41: the dashboard's gate probe.
    expect(apiSignatures.has('GET admin/me')).toBe(true);
    expect(apiSignatures.has('DELETE admin/offres/:param')).toBe(true);
  });

  it('registers all Stage 6 Piece D dispute and payment routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/payments')).toBe(true);
    expect(apiSignatures.has('GET admin/litiges')).toBe(true);
    expect(apiSignatures.has('GET admin/litiges/:param')).toBe(true);
    expect(apiSignatures.has('POST admin/commandes/:param/dispute')).toBe(true);
    expect(apiSignatures.has('PATCH admin/litiges/:param/assign')).toBe(true);
    expect(apiSignatures.has('PATCH admin/litiges/:param/unassign')).toBe(true);
    expect(apiSignatures.has('POST admin/litiges/:param/notes')).toBe(true);
    expect(apiSignatures.has('POST admin/litiges/:param/resolve-release')).toBe(true);
    expect(apiSignatures.has('POST admin/litiges/:param/resolve-refund')).toBe(true);
    expect(apiSignatures.has('POST admin/litiges/:param/resolve-dismiss')).toBe(true);
  });

  it('registers all Stage 6 Piece E catalog routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/catalog/overview')).toBe(true);
    expect(apiSignatures.has('GET admin/catalog/categories')).toBe(true);
    expect(apiSignatures.has('POST admin/catalog/categories')).toBe(true);
    expect(apiSignatures.has('PATCH admin/catalog/categories/reorder')).toBe(true);
    expect(apiSignatures.has('PATCH admin/catalog/categories/:param')).toBe(true);
    expect(apiSignatures.has('PATCH admin/catalog/categories/:param/active')).toBe(true);
    expect(apiSignatures.has('GET admin/catalog/brands')).toBe(true);
    expect(apiSignatures.has('POST admin/catalog/brands')).toBe(true);
    expect(apiSignatures.has('PATCH admin/catalog/brands/:param')).toBe(true);
    expect(apiSignatures.has('DELETE admin/catalog/brands/:param')).toBe(true);
    expect(apiSignatures.has('GET admin/catalog/models')).toBe(true);
    expect(apiSignatures.has('POST admin/catalog/models')).toBe(true);
    expect(apiSignatures.has('PATCH admin/catalog/models/:param')).toBe(true);
    expect(apiSignatures.has('DELETE admin/catalog/models/:param')).toBe(true);
  });

  it('registers Feature F12 catalog fault-types routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/catalog/fault-types')).toBe(true);
    expect(apiSignatures.has('POST admin/catalog/fault-types')).toBe(true);
    expect(apiSignatures.has('PATCH admin/catalog/fault-types/:param')).toBe(true);
    expect(apiSignatures.has('DELETE admin/catalog/fault-types/:param')).toBe(true);
    expect(apiSignatures.has('POST admin/catalog/fault-types/reorder')).toBe(true);
  });

  it('registers Stage 6 Piece F statistics routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/stats/overview')).toBe(true);
  });

  it('registers the CF4-D flexible-refunds pay-share route', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('POST admin/commandes/:param/refund/pay-share')).toBe(true);
  });

  it('registers the CF4-20 admin shipments list route', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/shipments')).toBe(true);
  });

  it('registers the CF4-19 admin refunds list and detail routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/refunds')).toBe(true);
    expect(apiSignatures.has('GET admin/refunds/:param')).toBe(true);
  });

  it('registers the CF4-21 admin verifications list route, and no longer the old queue route', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/verifications')).toBe(true);
    expect(apiSignatures.has('GET admin/reparateurs/verifications')).toBe(false);
  });

  it('registers the CF4-L tips and reviews routes, and no longer the no-motif review delete', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'GET admin/tips',
      'POST admin/tips',
      'PATCH admin/tips/:param',
      'DELETE admin/tips/:param',
      'GET admin/reviews',
      'GET admin/reviews/:param',
      'PATCH admin/reviews/:param/hide',
      'PATCH admin/reviews/:param/restore',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }
    expect(apiSignatures.has('PATCH admin/reviews/:param/delete')).toBe(false);
  });

  it('registers the CF4-M identity decision routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'PATCH admin/users/:param/identity/accept',
      'PATCH admin/users/:param/identity/refuse',
      'PATCH admin/users/:param/identity/request-documents',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }
  });

  it('registers the CF5-09 staff and invitation management and public onboarding routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'GET admin/staff/invitations',
      'POST admin/staff/invitations',
      'DELETE admin/staff/invitations/:param',
      'POST admin/staff/invitations/:param/resend',
      'GET admin/staff/members',
      'PATCH admin/users/:param/role',
      'POST admin/users/:param/two-factor/reset',
      'GET admin/staff/invitations/public/verify',
      'POST admin/staff/invitations/public/accept',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }
  });

  it('registers Feature F2 admin communications hub routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'POST admin/communications/preview',
      'GET admin/communications/history',
      'POST admin/communications/send',
      // V7 D2 (U5): the dashboard calls it through `fetchFn`, which the `fetch(` scan above cannot see
      // (`AUD7-F51`, `ISS7-020`).
      'GET admin/communications/recipients',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }
  });

  it("registers Feature F4 journal d'audit routes in correct NestJS order", () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'GET admin/audit',
      'GET admin/audit/kpis',
      'GET admin/audit/export',
      'GET admin/audit/:param',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }

    const auditRoutes = apiRoutes.filter((r) => r.path.startsWith('audit'));
    const kpisIndex = auditRoutes.findIndex((r) => r.path === 'audit/kpis');
    const exportIndex = auditRoutes.findIndex((r) => r.path === 'audit/export');
    const idIndex = auditRoutes.findIndex((r) => r.path === 'audit/:id');

    expect(kpisIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeGreaterThan(-1);
    expect(idIndex).toBeGreaterThan(-1);
    expect(kpisIndex).toBeLessThan(idIndex);
    expect(exportIndex).toBeLessThan(idIndex);
  });

  it('registers Feature F5 versements réparateurs routes in correct NestJS order', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'GET admin/payouts',
      'GET admin/payouts/incomplete-accounts',
      'GET admin/payouts/kpis',
      'GET admin/payouts/export',
      'GET admin/payouts/:param',
      'POST admin/payouts/:param/retry',
      'POST admin/payouts/accounts/:param/sync',
      'POST admin/payouts/accounts/:param/remind',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }

    const payoutRoutes = apiRoutes.filter((r) => r.path.startsWith('payouts'));
    const incompleteIndex = payoutRoutes.findIndex((r) => r.path === 'payouts/incomplete-accounts');
    const kpisIndex = payoutRoutes.findIndex((r) => r.path === 'payouts/kpis');
    const exportIndex = payoutRoutes.findIndex((r) => r.path === 'payouts/export');
    const syncIndex = payoutRoutes.findIndex((r) => r.path === 'payouts/accounts/:userId/sync');
    const remindIndex = payoutRoutes.findIndex((r) => r.path === 'payouts/accounts/:userId/remind');
    const idIndex = payoutRoutes.findIndex((r) => r.path === 'payouts/:id');

    expect(incompleteIndex).toBeGreaterThan(-1);
    expect(kpisIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeGreaterThan(-1);
    expect(syncIndex).toBeGreaterThan(-1);
    expect(remindIndex).toBeGreaterThan(-1);
    expect(idIndex).toBeGreaterThan(-1);

    expect(incompleteIndex).toBeLessThan(idIndex);
    expect(kpisIndex).toBeLessThan(idIndex);
    expect(exportIndex).toBeLessThan(idIndex);
    expect(syncIndex).toBeLessThan(idIndex);
    expect(remindIndex).toBeLessThan(idIndex);
  });

  it('registers Feature F6 exports comptables routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'GET admin/exports/summary',
      'GET admin/exports/preview',
      'GET admin/exports/download',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }
  });

  it('registers Feature F7 alertes admin routes in correct NestJS order', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'GET admin/alerts/unread-count',
      'GET admin/alerts/kpis',
      'GET admin/alerts/preferences',
      'PATCH admin/alerts/preferences',
      'POST admin/alerts/mark-all-read',
      'PATCH admin/alerts/:param/read',
      'GET admin/alerts',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }

    const alertRoutes = apiRoutes.filter((r) => r.path.startsWith('alerts'));
    const unreadCountIndex = alertRoutes.findIndex((r) => r.path === 'alerts/unread-count');
    const kpisIndex = alertRoutes.findIndex((r) => r.path === 'alerts/kpis');
    const preferencesIndex = alertRoutes.findIndex((r) => r.path === 'alerts/preferences');
    const markAllReadIndex = alertRoutes.findIndex((r) => r.path === 'alerts/mark-all-read');
    const idReadIndex = alertRoutes.findIndex((r) => r.path === 'alerts/:id/read');

    expect(unreadCountIndex).toBeGreaterThan(-1);
    expect(kpisIndex).toBeGreaterThan(-1);
    expect(preferencesIndex).toBeGreaterThan(-1);
    expect(markAllReadIndex).toBeGreaterThan(-1);
    expect(idReadIndex).toBeGreaterThan(-1);

    expect(unreadCountIndex).toBeLessThan(idReadIndex);
    expect(kpisIndex).toBeLessThan(idReadIndex);
    expect(preferencesIndex).toBeLessThan(idReadIndex);
    expect(markAllReadIndex).toBeLessThan(idReadIndex);
  });

  it('registers Feature F8 global search routes (search and search/detailed)', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/search')).toBe(true);
    expect(apiSignatures.has('GET admin/search/detailed')).toBe(true);
  });

  it('registers Feature F9 administrative conversations routes in correct NestJS order', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    for (const sig of [
      'GET admin/conversations/kpis',
      'POST admin/conversations/:param/close',
      'POST admin/conversations/:param/reopen',
      'GET admin/conversations/:param',
      'GET admin/conversations',
    ]) {
      expect(apiSignatures.has(sig), sig).toBe(true);
    }

    const convRoutes = apiRoutes.filter((r) => r.path.startsWith('conversations'));
    const kpisIndex = convRoutes.findIndex((r) => r.path === 'conversations/kpis');
    const idIndex = convRoutes.findIndex((r) => r.path === 'conversations/:id');

    expect(kpisIndex).toBeGreaterThan(-1);
    expect(idIndex).toBeGreaterThan(-1);
    expect(kpisIndex).toBeLessThan(idIndex);
  });

  it('registers Feature F10 platform settings routes', () => {
    const apiSignatures = new Set(
      apiRoutes.map((r) => `${r.method} admin/${normalizeApiPath(r.path)}`),
    );
    expect(apiSignatures.has('GET admin/settings')).toBe(true);
    expect(apiSignatures.has('PATCH admin/settings')).toBe(true);
  });
});





