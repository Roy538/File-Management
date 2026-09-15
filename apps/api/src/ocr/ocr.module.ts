import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { OcrProcessor } from './ocr.processor';
import { OCR_QUEUE } from '../documents/documents.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: OCR_QUEUE }),
    HttpModule,
    CommonModule,
    StorageModule,
  ],
  providers: [OcrProcessor],
})
export class OcrModule {}
