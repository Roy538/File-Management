import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { DocumentsService, OCR_QUEUE } from './documents.service';
import { DocumentsController } from './documents.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: OCR_QUEUE }),
    CommonModule,
    StorageModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
