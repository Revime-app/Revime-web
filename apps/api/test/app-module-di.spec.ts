import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/**
 * 🛑 THE GATE THE PER-MODULE DI SPECS COULD NOT BE.
 *
 * `admin-module-di.spec.ts`, `cron-module-di.spec.ts` and `shipping-module-di.spec.ts` check that
 * `design:paramtypes` exists and has the constructor's ARITY. On 2026-09-29 the API failed to
 * boot - « Nest can't resolve dependencies of the IdentityService (PrismaService, ?) » - with all
 * three green: `identity.service.ts` imported `NotificationsService` with `import type`, which
 * TypeScript erases, so the parameter was emitted as `Function`. Arity 2, metadata present, and
 * Nest still had nothing to inject. Found only by starting the server for the CF4-D test-mode run.
 *
 * This walks EVERY module reachable from AppModule and checks the TYPE of every constructor
 * parameter: `Function`, `Object` or `undefined` means TypeScript lost the class, which is only
 * acceptable when an explicit `@Inject(...)` token covers that index (Nest records those in
 * `self:paramtypes`, which is how `@Inject(forwardRef(...))` parameters resolve).
 */

type Ctor = { new (...args: never[]): unknown; name: string };

function isModuleRef(x: unknown): x is Ctor {
  return typeof x === 'function';
}

function collectProviders(): Ctor[] {
  const seen = new Set<unknown>();
  const providers = new Set<Ctor>();
  const visit = (mod: unknown) => {
    // forwardRef(() => Module) arrives as { forwardRef: () => Module }.
    const resolved =
      mod && typeof mod === 'object' && 'forwardRef' in mod
        ? (mod as { forwardRef: () => unknown }).forwardRef()
        : mod;
    if (!isModuleRef(resolved) || seen.has(resolved)) return;
    seen.add(resolved);
    const own = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, resolved) as unknown[] | undefined) ?? [];
    for (const p of own) if (typeof p === 'function') providers.add(p as Ctor);
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, resolved) as unknown[] | undefined) ?? [];
    for (const m of imports) visit(m);
  };
  visit(AppModule);
  return [...providers];
}

describe('every provider reachable from AppModule has injectable constructor parameter types', () => {
  const providers = collectProviders();

  it('walks the real module graph, so an empty walk cannot pass as coverage', () => {
    const names = providers.map((p) => p.name);
    expect(providers.length).toBeGreaterThanOrEqual(20);
    expect(names).toContain('IdentityService');
    expect(names).toContain('RefundService');
    expect(names).toContain('AdminDisputesService');
    // CF4-H.
    expect(names).toContain('QuoteRequestsService');
  });

  it('no parameter was erased to Function / Object without an explicit @Inject token', () => {
    const broken: string[] = [];
    for (const p of providers) {
      const types = (Reflect.getMetadata('design:paramtypes', p) as unknown[] | undefined) ?? [];
      const explicit = (Reflect.getMetadata('self:paramtypes', p) as { index: number }[] | undefined) ?? [];
      types.forEach((t, index) => {
        const erased = t === undefined || t === Function || t === Object;
        if (erased && !explicit.some((e) => e.index === index)) broken.push(`${p.name}[${index}]`);
      });
    }
    expect(broken, `constructor parameters Nest cannot resolve (use a value import, not import type): ${broken.join(', ')}`).toEqual([]);
  });
});
