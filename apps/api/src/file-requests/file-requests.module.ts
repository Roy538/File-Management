import { Module } from '@nestjs/common';
import { FileRequestsService } from './file-requests.service';
import { FileRequestsController } from './file-requests.controller';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommonModule, NotificationsModule],
  controllers: [FileRequestsController],
  providers: [FileRequestsService],
})
export class FileRequestsModule {}
