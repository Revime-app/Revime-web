import { Controller, Get, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type {
  CategoryDto,
  CatalogBrandsQuery,
  CatalogModelsQuery,
  PublicBrandDto,
  PublicDeviceModelDto,
} from '@revime/shared';
import { catalogBrandsQuerySchema, catalogModelsQuerySchema } from '@revime/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CatalogService } from './catalog.service.js';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @AllowAnonymous()
  listCategories(): Promise<CategoryDto[]> {
    return this.catalog.listCategories();
  }

  @Get('brands')
  @AllowAnonymous()
  listBrands(
    @Query(new ZodValidationPipe(catalogBrandsQuerySchema)) query: CatalogBrandsQuery,
  ): Promise<PublicBrandDto[]> {
    return this.catalog.listBrands(query);
  }

  @Get('models')
  @AllowAnonymous()
  listModels(
    @Query(new ZodValidationPipe(catalogModelsQuerySchema)) query: CatalogModelsQuery,
  ): Promise<PublicDeviceModelDto[]> {
    return this.catalog.listModels(query);
  }
}

