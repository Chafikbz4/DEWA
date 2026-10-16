import { Module } from '@nestjs/common';
import { PharmacyStaffController } from './pharmacy-staff.controller';
import { StaffInvitationsService } from './staff-invitations.service';

@Module({
  controllers: [PharmacyStaffController],
  providers: [StaffInvitationsService],
})
export class PharmaciesModule {}
