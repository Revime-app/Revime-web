import 'reflect-metadata';
import { INJECTABLE_WATERMARK, MODULE_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { AdminModule } from '../src/admin/admin.module.js';
import { AdminPayoutsController } from '../src/admin/admin-payouts.controller.js';
import { AdminExportsController } from '../src/admin/admin-exports.controller.js';
import { AdminAlertsController } from '../src/admin/admin-alerts.controller.js';
import { AdminAlertsModule } from '../src/admin/admin-alerts.module.js';
import { AppModule } from '../src/app.module.js';
import { AdminConversationsController } from '../src/admin/admin-conversations.controller.js';
import { AdminConversationsService } from '../src/admin/admin-conversations.service.js';
import { Test } from '@nestjs/testing';
import { AdminSettingsController } from '../src/admin/admin-settings.controller.js';
import { AdminSettingsService } from '../src/admin/admin-settings.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AdminAuditService } from '../src/admin/admin-audit.service.js';

/**
 * 🛑 THE GATE FOR A DEFECT NEST DOES NOT REPORT.
 *
 * `AdminRepairersService` shipped on this branch with **no `@Injectable()`**. TypeScript emits
 * `design:paramtypes` only for a class carrying at least one decorator, so Nest saw no declared
 * dependencies, raised **no** resolution error, and called `new AdminRepairersService()`. The
 * app booted; `this.prisma` was `undefined`; every method touching Prisma threw a `TypeError`.
 *
 * The blast radius is why this is worth a gate rather than a comment:
 * `AdminUsersService.detail()` awaits `this.repairers.repairerBlock(userId)` **unconditionally**,
 * so `GET /admin/users/:id` answered **500 for every account**, client or réparateur - and every
 * §8.2 and §8.3 write form lives on that page, so the operator lost all of them. `/verifications`
 * failed too. Only `registryLookup` survived, because it never touches `this.prisma`.
 *
 * 🛑 WHY NOT A `@nestjs/testing` MODULE COMPILE, which would be the obvious stricter gate:
 * **it cannot see this.** Measured, not assumed - `Test.createTestingModule({ imports:
 * [AdminModule] }).compile()` SUCCEEDS with the decorator removed, because a missing
 * `design:paramtypes` reads to Nest as "this provider has no dependencies", which is a valid
 * state (every one of `promote-basic.ts`'s siblings is a plain function for that reason). A DI
 * compile proves the graph resolves; it says nothing about whether a provider was handed the
 * arguments its constructor declares. Reflection is the only place that fact exists.
 *
 * 🛑 The ledger predicted this class and filed it as a Minor. It was not a Minor.
 */

type Ctor = { new (...args: never[]): unknown; name: string; length: number };

const providers = (): Ctor[] =>
  (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AdminModule) as Ctor[] | undefined) ?? [];

describe('every AdminModule provider can actually receive its dependencies', () => {
  it('finds the providers at all, so an empty list cannot pass as coverage', () => {
    // 🛑 A broken check reports "fine", which is the dangerous direction. If the metadata key
    // or the module shape ever changes, this fails instead of silently auditing nothing.
    expect(providers().length).toBeGreaterThanOrEqual(10);
    expect(providers().map((p) => p.name)).toContain('ModerationAdminService');
    expect(providers().map((p) => p.name)).toContain('AdminRepairersService');
    expect(providers().map((p) => p.name)).toContain('AdminDemandesService');
    expect(providers().map((p) => p.name)).toContain('AdminDemandesWriteService');
    expect(providers().map((p) => p.name)).toContain('AdminOffresService');
    expect(providers().map((p) => p.name)).toContain('AdminDisputesService');
    expect(providers().map((p) => p.name)).toContain('AdminPaymentsService');
    expect(providers().map((p) => p.name)).toContain('AdminCatalogService');
    expect(providers().map((p) => p.name)).toContain('AdminStatsService');
    expect(providers().map((p) => p.name)).toContain('AdminTipsService');
    expect(providers().map((p) => p.name)).toContain('AdminReviewsService');
    expect(providers().map((p) => p.name)).toContain('AdminIdentityDecisionsService');
    expect(providers().map((p) => p.name)).toContain('AdminStaffService');
    expect(providers().map((p) => p.name)).toContain('AdminCommunicationsService');
    expect(providers().map((p) => p.name)).toContain('AdminPromoService');
    expect(providers().map((p) => p.name)).toContain('AdminAuditService');
    expect(providers().map((p) => p.name)).toContain('AdminPayoutsService');
    expect(providers().map((p) => p.name)).toContain('AdminExportsService');
    // One instance, owned by the global AdminAlertsModule: a copy here would be a second service.
    expect(providers().map((p) => p.name)).not.toContain('AdminAlertsService');
    expect(providers().map((p) => p.name)).toContain('AdminConversationsService');
    expect(providers().map((p) => p.name)).toContain('AdminSettingsService');
  });

  it('emits design:paramtypes for every provider whose constructor takes arguments', () => {
    // The exact defect: `undefined` here means Nest constructs the class with NO arguments.
    const broken = providers()
      .filter((p) => p.length > 0)
      .filter((p) => {
        const declared = Reflect.getMetadata('design:paramtypes', p) as unknown[] | undefined;
        return declared === undefined || declared.length !== p.length;
      })
      .map((p) => p.name);

    expect(
      broken,
      `providers whose constructor arguments Nest cannot see (add @Injectable()): ${broken.join(', ')}`,
    ).toEqual([]);
  });

  it('carries Nest’s own @Injectable() watermark on every provider', () => {
    // Asserted separately from the metadata above because it names the CAUSE rather than the
    // symptom: `design:paramtypes` is emitted by ANY decorator, so a class carrying some other
    // decorator would satisfy the test above while still not being marked as a provider.
    const unmarked = providers()
      .filter((p) => Reflect.getMetadata(INJECTABLE_WATERMARK, p) !== true)
      .map((p) => p.name);

    expect(
      unmarked,
      `AdminModule providers missing @Injectable(): ${unmarked.join(', ')}`,
    ).toEqual([]);
  });
});

const controllers = (): Ctor[] =>
  (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminModule) as Ctor[] | undefined) ?? [];

describe('every AdminModule controller can actually receive its dependencies', () => {
  it('registers AdminPayoutsController and emits its constructor paramtypes', () => {
    expect(controllers().map((c) => c.name)).toContain('AdminPayoutsController');
    const declared = Reflect.getMetadata('design:paramtypes', AdminPayoutsController) as unknown[] | undefined;
    expect(declared).toBeDefined();
    expect(declared?.length).toBe(1);
    expect((declared?.[0] as Ctor)?.name).toBe('AdminPayoutsService');
  });

  it('registers AdminExportsController and emits its constructor paramtypes', () => {
    expect(controllers().map((c) => c.name)).toContain('AdminExportsController');
    const declared = Reflect.getMetadata('design:paramtypes', AdminExportsController) as unknown[] | undefined;
    expect(declared).toBeDefined();
    expect(declared?.length).toBe(1);
    expect((declared?.[0] as Ctor)?.name).toBe('AdminExportsService');
  });

  it('registers AdminAlertsController and emits its constructor paramtypes', () => {
    expect(controllers().map((c) => c.name)).toContain('AdminAlertsController');
    const declared = Reflect.getMetadata('design:paramtypes', AdminAlertsController) as unknown[] | undefined;
    expect(declared).toBeDefined();
    expect(declared?.length).toBe(1);
    expect((declared?.[0] as Ctor)?.name).toBe('AdminAlertsService');
  });

  it('provides AdminAlertsService from a GLOBAL module, so the producers can inject it without a cycle', () => {
    expect(Reflect.getMetadata('__module:global__', AdminAlertsModule)).toBe(true);
    const providerNames = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AdminAlertsModule) as Ctor[]).map((p) => p.name);
    const exportedNames = (Reflect.getMetadata(MODULE_METADATA.EXPORTS, AdminAlertsModule) as Ctor[]).map((e) => e.name);
    expect(providerNames).toContain('AdminAlertsService');
    expect(exportedNames).toContain('AdminAlertsService');
    const appImports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[]).map((m: any) => m?.name);
    expect(appImports).toContain('AdminAlertsModule');
  });

  it('registers AdminConversationsController and emits its constructor paramtypes', () => {
    expect(controllers().map((c) => c.name)).toContain('AdminConversationsController');
    const declared = Reflect.getMetadata('design:paramtypes', AdminConversationsController) as unknown[] | undefined;
    expect(declared).toBeDefined();
    expect(declared?.length).toBe(1);
    expect((declared?.[0] as Ctor)?.name).toBe('AdminConversationsService');
  });

  it('exports AdminConversationsService for external consumer injection', () => {
    const exportsList = (Reflect.getMetadata(MODULE_METADATA.EXPORTS, AdminModule) as (Ctor | unknown)[] | undefined) ?? [];
    const exportedNames = exportsList.map((e: any) => (typeof e === 'function' ? e.name : e));
    expect(exportedNames).toContain('AdminConversationsService');
  });

  it('registers AdminSettingsController and emits its constructor paramtypes', () => {
    expect(controllers().map((c) => c.name)).toContain('AdminSettingsController');
    const declared = Reflect.getMetadata('design:paramtypes', AdminSettingsController) as unknown[] | undefined;
    expect(declared).toBeDefined();
    expect(declared?.length).toBe(1);
    expect((declared?.[0] as Ctor)?.name).toBe('AdminSettingsService');
  });

  it('exports AdminSettingsService for external consumer injection', () => {
    const exportsList = (Reflect.getMetadata(MODULE_METADATA.EXPORTS, AdminModule) as (Ctor | unknown)[] | undefined) ?? [];
    const exportedNames = exportsList.map((e: any) => (typeof e === 'function' ? e.name : e));
    expect(exportedNames).toContain('AdminSettingsService');
  });

  it('instantiates AdminSettingsController and AdminSettingsService via app.get() / testing module', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminSettingsController],
      providers: [
        AdminSettingsService,
        { provide: PrismaService, useValue: {} },
        { provide: AdminAuditService, useValue: {} },
      ],
    }).compile();

    const controller = moduleRef.get(AdminSettingsController);
    const service = moduleRef.get(AdminSettingsService);

    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  it('emits design:paramtypes for every controller whose constructor takes arguments', () => {
    const broken = controllers()
      .filter((c) => c.length > 0)
      .filter((c) => {
        const declared = Reflect.getMetadata('design:paramtypes', c) as unknown[] | undefined;
        return declared === undefined || declared.length !== c.length;
      })
      .map((c) => c.name);

    expect(
      broken,
      `controllers whose constructor arguments Nest cannot see: ${broken.join(', ')}`,
    ).toEqual([]);
  });
});

