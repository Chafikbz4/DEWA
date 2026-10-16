import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import {
  AllowAccountStatus,
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import {
  CurrentPharmacy,
  MyPharmacy,
} from '../../common/auth/pharmacy-access.guard';
import {
  ApiEnvelope,
  ApiErrors,
  MessageResultDto,
} from '../../common/swagger/api-responses';
import { CatalogService } from './catalog.service';
import {
  MedicineDto,
  MedicineSearchQueryDto,
  PutStockDto,
  StockImportQueryDto,
  StockQueryDto,
} from './dto/catalog.dto';

const COMMON = [
  'ROLE_FORBIDDEN',
  'PHARMACY_ACCESS_DENIED',
  'PHARMACY_NOT_VERIFIED',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
] as const;

@ApiTags('Catalog – medicines')
@ApiBearerAuth()
@Controller('medicines')
export class MedicinesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('search')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'Search the medicine catalog (fr / ar / DCI, typo-tolerant)',
    description: 'Any authenticated user.',
  })
  @ApiEnvelope(MedicineDto, { paginated: true })
  @ApiErrors('AUTH_TOKEN_MISSING')
  search(@Query() q: MedicineSearchQueryDto) {
    return this.catalog.search(q);
  }

  @Get(':id')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Medicine detail' })
  @ApiEnvelope(MedicineDto)
  @ApiErrors('MEDICINE_NOT_FOUND')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.getMedicine(id);
  }
}

@ApiTags('Pharmacy – stock')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT')
@Controller('pharmacy/stock')
export class PharmacyStockController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @MyPharmacy()
  @ApiOperation({
    summary: 'My stock (all staff)',
    description: 'Filter stock_status, q; sort updated_at | brand_name.',
  })
  @ApiErrors(...COMMON)
  list(@CurrentPharmacy() ph: PharmacyContext, @Query() q: StockQueryDto) {
    return this.catalog.listStock(ph, q);
  }

  @Put(':medicineId')
  @ApiParam({ name: 'medicineId', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({ summary: 'Set stock for a medicine (all staff, upsert)' })
  @ApiErrors('MEDICINE_NOT_FOUND', ...COMMON)
  put(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('medicineId', new ParseUUIDPipe()) medicineId: string,
    @Body() dto: PutStockDto,
  ) {
    return this.catalog.putStock(ph, medicineId, dto);
  }

  @Delete(':medicineId')
  @ApiParam({ name: 'medicineId', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({ summary: 'Remove a stock line (OWNER, PHARMACIST)' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('STOCK_NOT_FOUND', ...COMMON)
  remove(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('medicineId', new ParseUUIDPipe()) medicineId: string,
  ) {
    return this.catalog.deleteStock(ph, medicineId);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV ≤ 2 MB, ≤ 5000 lines',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Bulk stock import from CSV (OWNER, PHARMACIST)',
    description:
      'Header: `medicine_id` or `regulatory_code`, `stock_status` (IN_STOCK|LOW|OUT_OF_STOCK), `quantity`, `unit_price_centimes`. ' +
      '`,` or `;` separated, UTF-8. Returns a validation report; invalid lines are skipped. `dry_run=true` validates only.',
  })
  @ApiErrors('STOCK_IMPORT_INVALID_FILE', ...COMMON)
  import(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query() q: StockImportQueryDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalog.importStock(
      user,
      ph,
      file?.buffer,
      q.dry_run ?? false,
      meta,
    );
  }
}
