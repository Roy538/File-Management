import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where: Prisma.NotificationWhereInput = { userId: user.sub };

    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: user.sub, isRead: false } }),
    ]);

    return { data, total, unread, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async createForWorkflowStep(
    businessUnitId: string,
    assigneeRole: string,
    stepName: string,
    instanceId: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: { businessUnitId, role: assigneeRole as Role, isActive: true },
      select: { id: true },
    });
    if (!users.length) return;
    await this.prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        title: 'Workflow step awaiting your review',
        message: `Step "${stepName}" in workflow instance ${instanceId} requires your approval.`,
      })),
    });
  }

  async notifyWrongLocationReturn(
    businessUnitId: string,
    fileNumber: string,
    returnedBy: string | undefined,
    actualLocation: string | undefined,
  ) {
    const officers = await this.prisma.user.findMany({
      where: { businessUnitId, role: { in: [Role.ADMIN, Role.OFFICER] }, isActive: true },
      select: { id: true },
    });
    if (!officers.length) return;
    await this.prisma.notification.createMany({
      data: officers.map(u => ({
        userId: u.id,
        title: `Wrong location return: ${fileNumber}`,
        message: `File ${fileNumber} was returned to an incorrect location${actualLocation ? ` (filed at: ${actualLocation})` : ''}${returnedBy ? ` by ${returnedBy}` : ''}. Please verify and relocate.`,
      })),
    });
  }

  async notifyDuplicateDispatch(
    businessUnitId: string,
    fileNumber: string,
    requestedBy: string,
  ) {
    const officers = await this.prisma.user.findMany({
      where: { businessUnitId, role: { in: [Role.ADMIN, Role.OFFICER] }, isActive: true },
      select: { id: true },
    });
    if (!officers.length) return;
    await this.prisma.notification.createMany({
      data: officers.map(u => ({
        userId: u.id,
        title: `File request conflict: ${fileNumber}`,
        message: `${requestedBy} requested file ${fileNumber}, but it is currently dispatched. Please follow up or reject the request.`,
      })),
    });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkOverdueDispatches() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const overdueDispatches = await this.prisma.dispatch.findMany({
      where: {
        actualReturnAt: null,
        expectedReturnAt: { lt: now },
      },
      include: {
        file: { select: { fileNumber: true, customerName: true } },
      },
    });

    for (const dispatch of overdueDispatches) {
      const alreadyNotified = await this.prisma.notification.count({
        where: {
          userId: dispatch.dispatchedById,
          title: `Overdue: ${dispatch.file.fileNumber}`,
          createdAt: { gte: startOfToday },
        },
      });

      if (!alreadyNotified) {
        const days = Math.ceil((now.getTime() - dispatch.expectedReturnAt!.getTime()) / 86_400_000);
        await this.prisma.notification.create({
          data: {
            userId: dispatch.dispatchedById,
            title: `Overdue: ${dispatch.file.fileNumber}`,
            message: `File ${dispatch.file.fileNumber} (${dispatch.file.customerName}) dispatched to ${dispatch.dispatchedTo} is ${days} day${days === 1 ? '' : 's'} overdue.`,
          },
        });
      }
    }
  }
}
