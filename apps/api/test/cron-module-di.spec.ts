import 'reflect-metadata';
import { INJECTABLE_WATERMARK, MODULE_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { CronModule } from '../src/cron/cron.module.js';

type Ctor = { new (...args: never[]): unknown; name: string; length: number };
const providers = (): Ctor[] =>
  (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CronModule) as Ctor[] | undefined) ?? [];

/**
 * The reflection gate `shipping-module-di.spec.ts` established, pointed at CronModule now that
 * CronService takes a fourth constructor dependency (ShipmentsService, for `shipmentSweep`).
 */
describe('every CronModule provider can actually receive its dependencies', () => {
  it('finds the service, so an empty list cannot pass as coverage', () => {
    expect(providers().map((p) => p.name)).toEqual(['CronService']);
  });
  it("emits design:paramtypes matching each constructor's arity", () => {
    const broken = providers()
      .filter((p) => p.length > 0)
      .filter((p) => {
        const declared = Reflect.getMetadata('design:paramtypes', p) as unknown[] | undefined;
        return declared === undefined || declared.length !== p.length;
      })
      .map((p) => p.name);
    expect(broken).toEqual([]);
  });
  it('carries the @Injectable() watermark on every provider', () => {
    expect(providers().filter((p) => Reflect.getMetadata(INJECTABLE_WATERMARK, p) !== true).map((p) => p.name)).toEqual([]);
  });
});
