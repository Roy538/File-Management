import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected');
    } catch {
      // Allow the server to start without a DB — queries will fail at call-time.
      // In production (Docker), the DB will always be up before the API starts.
      this.logger.warn('Database not reachable at startup — server will retry on first query');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
