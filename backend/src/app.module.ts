import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountStatusGuard } from './common/auth/account-status.guard';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { CommonModule } from './common/common.module';
import {
  AppThrottlerGuard,
  throttlerOptionsFactory,
} from './common/security/throttling';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DeliveryConfigModule } from './modules/delivery-config/delivery-config.module';
import { FilesModule } from './modules/files/files.module';
import { MessagingCoreModule } from './modules/messaging/messaging-core.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OffersModule } from './modules/offers/offers.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SupportModule } from './modules/support/support.module';
import { GeoModule } from './modules/geo/geo.module';
import { HealthController } from './modules/health/health.controller';
import { PatientsModule } from './modules/patients/patients.module';
import { RequestsModule } from './modules/requests/requests.module';
import { PharmaciesModule } from './modules/pharmacies/pharmacies.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // .env.local: Neon vars (`neon env pull`); .env: app secrets. ENV_FILE overrides (tests).
      envFilePath: process.env.ENV_FILE
        ? [process.env.ENV_FILE]
        : ['.env.local', '.env'],
      validate: validateEnv,
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          issuer: 'dewa-api',
          audience: 'dewa-clients',
          algorithm: 'HS256',
        },
        verifyOptions: {
          issuer: 'dewa-api',
          audience: 'dewa-clients',
          algorithms: ['HS256'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: throttlerOptionsFactory,
    }),
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 50 }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CommonModule,
    FilesModule,
    GeoModule,
    MessagingCoreModule,
    NotificationsModule,
    RealtimeModule,
    MessagingModule,
    DeliveryConfigModule,
    CatalogModule,
    OffersModule,
    SupportModule,
    PatientsModule,
    RequestsModule,
    AuthModule,
    UsersModule,
    PharmaciesModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit → authenticate → account status → role.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccountStatusGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
