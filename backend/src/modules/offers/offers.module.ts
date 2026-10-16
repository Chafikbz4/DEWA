import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PharmaciesModule } from '../pharmacies/pharmacies.module';
import { RequestsModule } from '../requests/requests.module';
import {
  PatientOffersController,
  PharmacyOffersController,
} from './offers.controller';
import { OffersService } from './offers.service';

@Injectable()
class OffersJobs {
  private readonly logger = new Logger('OffersJobs');
  constructor(
    private readonly offers: OffersService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireOffers() {
    if (!this.config.get<boolean>('JOBS_ENABLED', true)) return;
    const n = await this.offers.expireDue();
    if (n) this.logger.log(`Expired ${n} offer(s)`);
  }
}

@Module({
  imports: [RequestsModule, PharmaciesModule],
  controllers: [PharmacyOffersController, PatientOffersController],
  providers: [OffersService, OffersJobs],
  exports: [OffersService],
})
export class OffersModule {}
