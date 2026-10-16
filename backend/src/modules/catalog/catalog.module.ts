import { Module } from '@nestjs/common';
import {
  MedicinesController,
  PharmacyStockController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [MedicinesController, PharmacyStockController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
