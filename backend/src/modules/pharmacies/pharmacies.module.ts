import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { PHARMACY_ROLES } from '../../common/auth/auth-user';
import { Database, DRIZZLE } from '../../database/database.module';
import { pharmacyDocuments, pharmacyStaff } from '../../database/schema';
import { AuthModule } from '../auth/auth.module';
import { FileAccessService } from '../files/file-access.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { PharmacyProfileController } from './pharmacy-profile.controller';
import { PharmacyRegisterController } from './pharmacy-register.controller';
import { PharmacyReportsController } from './pharmacy-reports.controller';
import { RequestsModule } from '../requests/requests.module';
import { PharmacyProfileService } from './pharmacy-profile.service';
import { PharmacyStaffController } from './pharmacy-staff.controller';
import { PublicPharmaciesController } from './public-pharmacies.controller';
import { StaffInvitationsService } from './staff-invitations.service';

@Module({
  imports: [AuthModule, RequestsModule],
  controllers: [
    PharmacyRegisterController,
    PublicPharmaciesController,
    PharmacyStaffController,
    PharmacyProfileController,
    InboxController,
    PharmacyReportsController,
  ],
  providers: [StaffInvitationsService, PharmacyProfileService, InboxService],
  exports: [PharmacyProfileService, StaffInvitationsService, InboxService],
})
export class PharmaciesModule implements OnModuleInit {
  constructor(
    private readonly fileAccess: FileAccessService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Verification documents: readable by the OWNER / PHARMACIST staff of that pharmacy. */
  onModuleInit() {
    this.fileAccess.registerRule(async (user, file) => {
      if (
        file.purpose !== 'PHARMACY_DOC' ||
        !PHARMACY_ROLES.includes(user.role)
      )
        return null;
      const [hit] = await this.db
        .select({ id: pharmacyDocuments.id })
        .from(pharmacyDocuments)
        .innerJoin(
          pharmacyStaff,
          eq(pharmacyStaff.pharmacyId, pharmacyDocuments.pharmacyId),
        )
        .where(
          and(
            eq(pharmacyDocuments.fileId, file.id),
            eq(pharmacyStaff.userId, user.id),
            eq(pharmacyStaff.isActive, true),
            inArray(pharmacyStaff.staffRole, ['OWNER', 'PHARMACIST']),
          ),
        )
        .limit(1);
      return hit ? { via: 'pharmacy-staff' } : null;
    });
  }
}
