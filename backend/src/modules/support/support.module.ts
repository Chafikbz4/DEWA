import { Module } from '@nestjs/common';
import {
  ComplaintsController,
  PharmacyComplaintsController,
} from './complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({
  controllers: [ComplaintsController, PharmacyComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class SupportModule {}
