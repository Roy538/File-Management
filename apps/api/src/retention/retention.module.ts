import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RetentionService } from './retention.service';
import { RetentionController } from './retention.controller';

@Module({
  imports: [CommonModule],
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
