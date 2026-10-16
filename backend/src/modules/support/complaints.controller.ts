import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import {
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import {
  CurrentPharmacy,
  MyPharmacy,
} from '../../common/auth/pharmacy-access.guard';
import { ApiErrors } from '../../common/swagger/api-responses';
import { ComplaintsService } from './complaints.service';
import {
  ComplaintMessageDto,
  ComplaintsQueryDto,
  CreateComplaintDto,
} from './dto/complaints.dto';

@ApiTags('Complaints')
@ApiBearerAuth()
@Roles(
  'PATIENT',
  'DRIVER',
  'DELIVERY_COMPANY_ADMIN',
  'PHARMACY_OWNER',
  'PHARMACIST',
  'PHARMACY_ASSISTANT',
)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  @ApiOperation({
    summary: 'File a complaint',
    description:
      'Reference CMP-YYYY-NNNNNN. Handled by support admins (Phase 9).',
  })
  @ApiErrors('PHARMACY_NOT_FOUND', 'NOT_FOUND', 'AUTH_TOKEN_MISSING')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateComplaintDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.complaints.create(user, dto, meta);
  }

  @Get()
  @ApiOperation({ summary: 'Complaints I filed' })
  @ApiErrors('AUTH_TOKEN_MISSING')
  list(@CurrentUser() user: AuthUser, @Query() q: ComplaintsQueryDto) {
    return this.complaints.listMine(user, q);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'One of my complaints with its messages' })
  @ApiErrors('COMPLAINT_NOT_FOUND')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.complaints.getMine(user, id);
  }

  @Post(':id/messages')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Add a message to my complaint' })
  @ApiErrors('COMPLAINT_NOT_FOUND', 'COMPLAINT_CLOSED', 'FILE_INVALID_FOR_USE')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ComplaintMessageDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.complaints.replyMine(user, id, dto, meta);
  }
}

@ApiTags('Pharmacy – complaints')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST')
@Controller('pharmacy/complaints')
export class PharmacyComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary: 'Complaints against my pharmacy (OWNER, PHARMACIST)',
  })
  @ApiErrors(
    'ROLE_FORBIDDEN',
    'PHARMACY_ACCESS_DENIED',
    'PHARMACY_NOT_VERIFIED',
  )
  list(@CurrentPharmacy() ph: PharmacyContext, @Query() q: ComplaintsQueryDto) {
    return this.complaints.listForPharmacy(ph, q);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({ summary: 'Complaint detail (OWNER, PHARMACIST)' })
  @ApiErrors('COMPLAINT_NOT_FOUND', 'ROLE_FORBIDDEN', 'PHARMACY_ACCESS_DENIED')
  get(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.complaints.getForPharmacy(ph, id);
  }

  @Post(':id/reply')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({ summary: 'Reply to a complaint (OWNER, PHARMACIST)' })
  @ApiErrors(
    'COMPLAINT_NOT_FOUND',
    'COMPLAINT_CLOSED',
    'ROLE_FORBIDDEN',
    'PHARMACY_ACCESS_DENIED',
  )
  reply(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ComplaintMessageDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.complaints.replyAsPharmacy(user, ph, id, dto, meta);
  }
}
