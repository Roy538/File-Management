import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { ESignatureService } from './esignature.service';
import { ESignatureController } from './esignature.controller';

@Module({
  imports: [HttpModule, CommonModule, StorageModule],
  controllers: [ESignatureController],
  providers: [ESignatureService],
})
export class ESignatureModule {}
