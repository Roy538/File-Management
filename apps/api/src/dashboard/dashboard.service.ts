import { Injectable } from '@nestjs/common';
import { DocumentStatus, FileStatus, Role, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(user: JwtPayload) {
    const fileWhere = {
      businessUnitId: user.businessUnitId,
      isActive: true,
      ...(user.role !== Role.ADMIN && { branchId: user.branchId }),
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const [
      totalFiles,
      available,
      dispatched,
      returned,
      archived,
      missing,
      overdue,
      dispatchedToday,
      returnedToday,
      recentDispatches,
      recentReturns,
      totalDocuments,
      checkedOutDocuments,
      pendingApprovals,
      unreadAlerts,
    ] = await Promise.all([
      this.prisma.file.count({ where: fileWhere }),
      this.prisma.file.count({ where: { ...fileWhere, status: FileStatus.AVAILABLE } }),
      this.prisma.file.count({ where: { ...fileWhere, status: FileStatus.DISPATCHED } }),
      this.prisma.file.count({ where: { ...fileWhere, status: FileStatus.RETURNED } }),
      this.prisma.file.count({ where: { ...fileWhere, status: FileStatus.ARCHIVED } }),
      this.prisma.file.count({ where: { ...fileWhere, status: FileStatus.MISSING } }),
      this.prisma.dispatch.count({
        where: {
          actualReturnAt: null,
          expectedReturnAt: { lt: now },
          file: fileWhere,
        },
      }),
      this.prisma.dispatch.count({
        where: { createdAt: { gte: today }, file: fileWhere },
      }),
      this.prisma.dispatch.count({
        where: { actualReturnAt: { gte: today }, file: fileWhere },
      }),
      this.prisma.dispatch.findMany({
        where: { file: fileWhere },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          file: { select: { fileNumber: true, customerName: true } },
          dispatchedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.dispatch.findMany({
        where: { actualReturnAt: { not: null }, file: fileWhere },
        orderBy: { actualReturnAt: 'desc' },
        take: 5,
        include: {
          file: { select: { fileNumber: true, customerName: true } },
          return: {
            include: { receivedBy: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.document.count(),
      this.prisma.document.count({ where: { status: DocumentStatus.CHECKED_OUT } }),
      this.prisma.workflowInstance.count({ where: { status: WorkflowStatus.IN_PROGRESS } }),
      this.prisma.notification.count({ where: { userId: user.sub, isRead: false } }),
    ]);

    return {
      totalFiles,
      available,
      dispatched,
      returned,
      archived,
      missing,
      inRegistry: available + returned,
      overdue,
      dispatchedToday,
      returnedToday,
      recentDispatches,
      recentReturns,
      totalDocuments,
      checkedOutDocuments,
      pendingApprovals,
      unreadAlerts,
    };
  }
}
