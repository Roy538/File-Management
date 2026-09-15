import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { CabinetsService } from './cabinets.service';
import { CabinetsController } from './cabinets.controller';

@Module({
  imports: [CommonModule],
  controllers: [CabinetsController],
  providers: [CabinetsService],
  exports: [CabinetsService],
})
export class CabinetsModule {}
