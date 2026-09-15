import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InventoryModule } from './inventory/inventory.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { TrackingModule } from './tracking/tracking.module';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { CabinetsModule } from './cabinets/cabinets.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { OcrModule } from './ocr/ocr.module';
import { ESignatureModule } from './esignature/esignature.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { RetentionModule } from './retention/retention.module';
import { ConversionModule } from './conversion/conversion.module';
import { FileRequestsModule } from './file-requests/file-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => {
        const raw = cfg.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const url = new URL(raw);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            ...(url.password && { password: decodeURIComponent(url.password) }),
          },
        };
      },
      inject: [ConfigService],
    }),
    CommonModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    InventoryModule,
    DispatchModule,
    TrackingModule,
    AuditModule,
    DashboardModule,
    NotificationsModule,
    ReportsModule,
    CabinetsModule,
    DocumentsModule,
    OcrModule,
    ESignatureModule,
    WorkflowsModule,
    RetentionModule,
    ConversionModule,
    FileRequestsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
