import { Module } from '@nestjs/common';
import { PharmacyStaffController } from './pharmacy-staff.controller';
import { PublicPharmaciesController } from './public-pharmacies.controller';
import { StaffInvitationsService } from './staff-invitations.service';

@Module({
  controllers: [PublicPharmaciesController, PharmacyStaffController],
  providers: [StaffInvitationsService],
})
export class PharmaciesModule {}
