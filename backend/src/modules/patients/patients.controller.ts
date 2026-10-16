import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import {
  ApiEnvelope,
  ApiErrors,
  MessageResultDto,
} from '../../common/swagger/api-responses';
import {
  AddressDto,
  CreateAddressDto,
  CreateDependantDto,
  DependantDto,
  PatientProfileDto,
  UpdateAddressDto,
  UpdateDependantDto,
  UpdatePatientProfileDto,
} from './dto/patients.dto';
import { PatientsService } from './patients.service';

const AUTH_ERRORS = [
  'ROLE_FORBIDDEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
  'AUTH_SESSION_REVOKED',
] as const;

@ApiTags('Patients – profile, addresses, dependants')
@ApiBearerAuth()
@Roles('PATIENT')
@Controller('patients/me')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  // ---------------------------------------------------------------- profile

  @Get()
  @ApiOperation({ summary: 'My patient profile' })
  @ApiEnvelope(PatientProfileDto)
  @ApiErrors(...AUTH_ERRORS)
  profile(@CurrentUser() user: AuthUser) {
    return this.patients.getProfile(user);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update my profile',
    description:
      'All fields optional. national_id is stored encrypted and returned masked.',
  })
  @ApiEnvelope(PatientProfileDto)
  @ApiErrors(...AUTH_ERRORS)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePatientProfileDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.patients.updateProfile(user, dto, meta);
  }

  // -------------------------------------------------------------- addresses

  @Get('addresses')
  @ApiOperation({
    summary: 'List my saved addresses',
    description: 'Default address first, then by created_at (`order`).',
  })
  @ApiEnvelope(AddressDto, { paginated: true })
  @ApiErrors(...AUTH_ERRORS)
  listAddresses(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.patients.listAddresses(user, q);
  }

  @Post('addresses')
  @ApiOperation({
    summary: 'Add an address',
    description:
      'commune_id must belong to wilaya_id. The first address becomes the default.',
  })
  @ApiEnvelope(AddressDto, { status: 201 })
  @ApiErrors('GEO_INVALID_COMMUNE', ...AUTH_ERRORS)
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.patients.createAddress(user, dto);
  }

  @Get('addresses/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Get one of my addresses' })
  @ApiEnvelope(AddressDto)
  @ApiErrors('ADDRESS_NOT_FOUND', ...AUTH_ERRORS)
  getAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.patients.getAddress(user.id, id);
  }

  @Patch('addresses/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Update an address',
    description:
      'Partial update. `is_default: false` is ignored (use another address as default instead).',
  })
  @ApiEnvelope(AddressDto)
  @ApiErrors('ADDRESS_NOT_FOUND', 'GEO_INVALID_COMMUNE', ...AUTH_ERRORS)
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.patients.updateAddress(user, id, dto);
  }

  @Post('addresses/:id/default')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Make this my default address' })
  @ApiEnvelope(AddressDto)
  @ApiErrors('ADDRESS_NOT_FOUND', ...AUTH_ERRORS)
  setDefault(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.patients.setDefaultAddress(user, id);
  }

  @Delete('addresses/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Delete an address (soft delete)',
    description: 'Past requests keep their frozen address snapshot.',
  })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('ADDRESS_NOT_FOUND', ...AUTH_ERRORS)
  deleteAddress(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.patients.deleteAddress(user, id);
  }

  // ------------------------------------------------------------- dependants

  @Get('dependants')
  @ApiOperation({ summary: 'List my dependants' })
  @ApiEnvelope(DependantDto, { paginated: true })
  @ApiErrors(...AUTH_ERRORS)
  listDependants(
    @CurrentUser() user: AuthUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.patients.listDependants(user, q);
  }

  @Post('dependants')
  @ApiOperation({
    summary: 'Declare a dependant',
    description:
      'authorization_status starts DECLARED. Upload a proof (purpose DEPENDANT_PROOF) so an admin can set it to VERIFIED. ' +
      'Requests are allowed only for relationships in the platform setting `dependant_allowed_relationships`.',
  })
  @ApiEnvelope(DependantDto, { status: 201 })
  @ApiErrors('FILE_INVALID_FOR_USE', ...AUTH_ERRORS)
  createDependant(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDependantDto,
  ) {
    return this.patients.createDependant(user, dto);
  }

  @Get('dependants/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Get a dependant' })
  @ApiEnvelope(DependantDto)
  @ApiErrors('DEPENDANT_NOT_FOUND', ...AUTH_ERRORS)
  getDependant(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.patients.getDependant(user, id);
  }

  @Patch('dependants/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Update a dependant',
    description:
      'Changing identity fields or the proof resets authorization_status to DECLARED.',
  })
  @ApiEnvelope(DependantDto)
  @ApiErrors('DEPENDANT_NOT_FOUND', 'FILE_INVALID_FOR_USE', ...AUTH_ERRORS)
  updateDependant(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDependantDto,
  ) {
    return this.patients.updateDependant(user, id, dto);
  }

  @Delete('dependants/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Remove a dependant (soft delete)' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('DEPENDANT_NOT_FOUND', ...AUTH_ERRORS)
  deleteDependant(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.patients.deleteDependant(user, id);
  }
}
