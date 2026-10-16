import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PERMISSIONS } from '../../common/auth/permissions';
import { PermissionsService } from '../../common/auth/permissions.guard';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  chifaSubmissions,
  messages,
  requestFiles,
} from '../../database/schema';
import { AuthModule } from '../auth/auth.module';
import { FileAccessService } from '../files/file-access.service';
import { PaymentsModule } from '../payments/payments.module';
import { AdminAccessService } from './admin-access.service';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminComplaintsService } from './admin-complaints.service';
import { AdminConfigService } from './admin-config.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import {
  AdminAccessController,
  AdminCatalogController,
  AdminComplaintsController,
  AdminDeliveryConfigController,
  AdminFinanceController,
  AdminInsightsController,
  AdminMonitoringController,
  AdminRulesController,
  AdminVerificationController,
} from './admin.controller';
import { MonitoringService } from './monitoring.service';
import { LOG_TYPE, SensitiveGrantsService } from './sensitive-grants.service';
import { VerificationService } from './verification.service';

const VERIFICATION_PURPOSES = [
  'PHARMACY_DOC',
  'DRIVER_DOC',
  'DELIVERY_COMPANY_DOC',
  'DEPENDANT_PROOF',
];

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [
    AdminUsersController,
    AdminAccessController,
    AdminVerificationController,
    AdminMonitoringController,
    AdminFinanceController,
    AdminDeliveryConfigController,
    AdminComplaintsController,
    AdminRulesController,
    AdminCatalogController,
    AdminInsightsController,
  ],
  providers: [
    AdminUsersService,
    AdminAccessService,
    VerificationService,
    SensitiveGrantsService,
    MonitoringService,
    AdminComplaintsService,
    AdminConfigService,
    AdminCatalogService,
    AdminInsightsService,
    AdminSettingsService,
  ],
})
export class AdminModule implements OnModuleInit {
  constructor(
    private readonly fileAccess: FileAccessService,
    private readonly permissions: PermissionsService,
    private readonly grants: SensitiveGrantsService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /**
   * Admin file access:
   * - verification documents → verification.read (URL issuance is audited);
   * - prescription / Chifa / chat attachments → only with an active grant on
   *   the request / conversation (recorded as a sensitive access).
   */
  onModuleInit() {
    this.fileAccess.registerRule(async (user, file) => {
      if (
        (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') ||
        !user.mfaEnabled
      )
        return null;

      if (VERIFICATION_PURPOSES.includes(file.purpose)) {
        const perms = await this.permissions.permissionsOf(user);
        return perms.has(PERMISSIONS.VERIFICATION_READ)
          ? { via: 'admin-verification' }
          : null;
      }

      let resource: { type: 'REQUEST' | 'CONVERSATION'; ids: string[] } | null =
        null;
      if (file.purpose === 'PRESCRIPTION')
        resource = {
          type: 'REQUEST',
          ids: (
            await this.db
              .select({ id: requestFiles.requestId })
              .from(requestFiles)
              .where(eq(requestFiles.fileId, file.id))
          ).map((r) => r.id),
        };
      else if (file.purpose === 'CHIFA_CARD')
        resource = {
          type: 'REQUEST',
          ids: (
            await this.db
              .select({ id: chifaSubmissions.requestId })
              .from(chifaSubmissions)
              .where(eq(chifaSubmissions.cardFileId, file.id))
          ).map((r) => r.id),
        };
      else if (file.purpose === 'MESSAGE_ATTACHMENT')
        resource = {
          type: 'CONVERSATION',
          ids: (
            await this.db
              .select({ id: messages.conversationId })
              .from(messages)
              .where(eq(messages.fileId, file.id))
          ).map((r) => r.id),
        };
      if (!resource) return null;

      const perms = await this.permissions.permissionsOf(user);
      if (!perms.has(PERMISSIONS.SENSITIVE_ACCESS)) return null;
      for (const id of resource.ids) {
        const g = await this.grants.hasActive(user.id, resource.type, id);
        if (g)
          return {
            via: 'admin-sensitive-grant',
            sensitive: {
              type:
                file.purpose === 'CHIFA_CARD'
                  ? 'CHIFA'
                  : LOG_TYPE[resource.type],
              resourceId: id,
              justification: g.justification,
            },
          };
      }
      return null;
    });
  }
}
