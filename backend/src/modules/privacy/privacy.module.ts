import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { RequestsModule } from '../requests/requests.module';
import {
  PrivacyController,
  RetentionAdminController,
} from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { RetentionService } from './retention.service';

@Injectable()
class RetentionJobs {
  private readonly logger = new Logger('RetentionJobs');
  constructor(
    private readonly retention: RetentionService,
    private readonly config: ConfigService,
  ) {}

  /** Daily secure deletion at 03:15 UTC. */
  @Cron('0 15 3 * * *')
  async run() {
    if (!this.config.get<boolean>('JOBS_ENABLED', true)) return;
    const r = await this.retention.runAll();
    this.logger.log(`retention ${JSON.stringify(r)}`);
  }
}

@Module({
  imports: [AuthModule, RequestsModule],
  controllers: [PrivacyController, RetentionAdminController],
  providers: [PrivacyService, RetentionService, RetentionJobs],
  exports: [RetentionService],
})
export class PrivacyModule {}
