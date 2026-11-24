import { Module } from '@nestjs/common';
import { GeocodeService } from './geocode.service.js';

@Module({
  providers: [GeocodeService],
  exports: [GeocodeService],
})
export class GeoModule {}
