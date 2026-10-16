import {
  Body,
  Controller,
  Delete,
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
import type { AuthUser } from '../../common/auth/auth-user';
import {
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import { PharmacyAccess } from '../../common/auth/pharmacy-access.guard';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { InvitationDto, InviteStaffDto } from '../auth/dto/register.dto';
import { StaffInvitationsService } from './staff-invitations.service';

const OWNER_ONLY_ERRORS = [
  'ROLE_FORBIDDEN',
  'PHARMACY_ACCESS_DENIED',
  'PHARMACY_NOT_VERIFIED',
  'PHARMACY_NOT_FOUND',
  'ACCOUNT_PENDING_VERIFICATION',
  'ACCOUNT_SUSPENDED',
  'AUTH_TOKEN_MISSING',
] as const;

@ApiTags('Pharmacies – staff')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER')
@Controller('pharmacies/:id/staff')
@ApiParam({ name: 'id', format: 'uuid', description: 'Pharmacy id' })
export class PharmacyStaffController {
  constructor(private readonly invitations: StaffInvitationsService) {}

  @Post('invite')
  @PharmacyAccess({ staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: 'Invite a pharmacist or assistant (owner only)',
    description:
      'Pharmacy must be VERIFIED. Sends an invitation token by SMS/email (expires after STAFF_INVITATION_TTL_DAYS = 7). ' +
      'The invitee completes POST /auth/register/staff. A new invitation to the same person revokes the previous one.',
  })
  @ApiEnvelope(InvitationDto, { status: 201 })
  @ApiErrors('AUTH_IDENTIFIER_REQUIRED', ...OWNER_ONLY_ERRORS)
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) pharmacyId: string,
    @Body() dto: InviteStaffDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.invitations.invite(user, pharmacyId, dto, meta);
  }

  @Get('invitations')
  @PharmacyAccess({ staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'List invitations of the pharmacy (owner only)' })
  @ApiEnvelope(InvitationDto, { paginated: true })
  @ApiErrors(...OWNER_ONLY_ERRORS)
  list(
    @Param('id', new ParseUUIDPipe()) pharmacyId: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.invitations.list(pharmacyId, q);
  }

  @Delete('invitations/:invitationId')
  @PharmacyAccess({ staffRoles: ['OWNER'] })
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  @ApiOperation({ summary: 'Revoke a pending invitation (owner only)' })
  @ApiEnvelope(InvitationDto)
  @ApiErrors('INVITATION_INVALID', ...OWNER_ONLY_ERRORS)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) pharmacyId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.invitations.revoke(user, pharmacyId, invitationId, meta);
  }
}
