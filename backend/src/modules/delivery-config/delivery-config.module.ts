import { Global, Module } from '@nestjs/common';
import { DeliveryFeeService } from './delivery-fee.service';

@Global()
@Module({
  providers: [DeliveryFeeService],
  exports: [DeliveryFeeService],
})
export class DeliveryConfigModule {}
