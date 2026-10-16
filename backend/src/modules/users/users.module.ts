import { Module } from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { MeController } from './me.controller';

@Module({
  controllers: [MeController],
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class UsersModule {}
