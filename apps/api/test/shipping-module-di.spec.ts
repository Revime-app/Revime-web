import 'reflect-metadata';
import { INJECTABLE_WATERMARK, MODULE_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { ShippingModule } from '../src/shipping/shipping.module.js';

type Ctor = { new (...args: never[]): unknown; name: string; length: number };
const providers = (): Ctor[] =>
  (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ShippingModule) as Ctor[] | undefined) ?? [];

/** The reflection gate `admin-module-di.spec.ts` established, pointed at the new module. */
describe('every ShippingModule provider can actually receive its dependencies', () => {
  it('finds the two services, so an empty list cannot pass as coverage', () => {
    expect(providers().map((p) => p.name).sort()).toEqual(['ShipmentsService', 'ShippingQuotesService']);
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
