import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FileStatus, FileMovementAction, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { QueryDispatchesDto } from './dto/query-dispatches.dto';
import { assertTransition } from '../inventory/file-status.machine';

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async dispatch(fileId: string, dto: CreateDispatchDto, user: JwtPayload) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, isActive: true } });
    if (!file) throw new NotFoundException('File not found');
    if (file.status !== FileStatus.AVAILABLE) {
      throw new BadRequestException(
        `File must be AVAILABLE to dispatch; current status: ${file.status}`,
      );
    }

    assertTransition(file.status, FileStatus.DISPATCHED);

    return this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          fileId,
          dispatchedById: user.sub,
          authorizedById: dto.authorizedById,
          dispatchedTo: dto.dispatchedTo,
          department: dto.department,
          reason: dto.reason,
          expectedReturnAt: dto.expectedReturnAt ? new Date(dto.expectedReturnAt) : undefined,
        },
        include: {
          file: { select: { fileNumber: true, customerName: true } },
          dispatchedBy: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.file.update({
        where: { id: fileId },
        data: { status: FileStatus.DISPATCHED, currentLocation: dto.department },
      });

      await tx.fileMovement.create({
        data: {
          fileId,
          action: FileMovementAction.DISPATCHED,
          performedById: user.sub,
          department: dto.department,
          fromLocation: file.currentLocation,
          toLocation: dto.department,
          notes: dto.reason,
        },
      });

      return dispatch;
    });
  }

  async recordReturn(dispatchId: string, dto: CreateReturnDto, user: JwtPayload) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: { file: true },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    if (dispatch.actualReturnAt) {
      throw new BadRequestException('This dispatch has already been returned');
    }

    assertTransition(dispatch.file.status, FileStatus.RETURNED);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dispatch.update({
        where: { id: dispatchId },
        data: { actualReturnAt: new Date() },
        include: {
          file: { select: { fileNumber: true, customerName: true } },
          dispatchedBy: { select: { firstName: true, lastName: true } },
          return: true,
        },
      });

      await tx.return.create({
        data: {
          fileId: dispatch.fileId,
          dispatchId,
          receivedById: user.sub,
          returnedBy: dto.returnedBy,
          condition: dto.condition,
          returnedToCorrectLocation: dto.returnedToCorrectLocation ?? true,
          actualLocation: dto.actualLocation,
          notes: dto.notes,
        },
      });

      await tx.file.update({
        where: { id: dispatch.fileId },
        data: {
          status: FileStatus.RETURNED,
          ...(dto.returnLocation ? { currentLocation: dto.returnLocation } : {}),
        },
      });

      await tx.fileMovement.create({
        data: {
          fileId: dispatch.fileId,
          action: FileMovementAction.RETURNED,
          performedById: user.sub,
          department: dispatch.department,
          fromLocation: dispatch.department,
          toLocation: dto.returnLocation ?? dispatch.file.currentLocation,
          notes: dto.notes,
        },
      });

      return updated;
    });

    if (dto.returnedToCorrectLocation === false) {
      await this.notifications.notifyWrongLocationReturn(
        dispatch.file.businessUnitId,
        dispatch.file.fileNumber,
        dto.returnedBy,
        dto.actualLocation,
      );
    }

    return result;
  }

  async findAll(query: QueryDispatchesDto, user: JwtPayload) {
    const { page = 1, pageSize = 20, fileId, pending, search, department } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DispatchWhereInput = {
      file: {
        businessUnitId: user.businessUnitId,
        isActive: true,
        ...(user.role !== Role.ADMIN && { branchId: user.branchId }),
      },
      ...(fileId ? { fileId } : {}),
      ...(pending === true ? { actualReturnAt: null } : {}),
      ...(pending === false ? { actualReturnAt: { not: null } } : {}),
      ...(search
        ? {
            OR: [
              { file: { fileNumber: { contains: search, mode: 'insensitive' } } },
              { file: { customerName: { contains: search, mode: 'insensitive' } } },
              { dispatchedTo: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(department ? { department: { contains: department, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.dispatch.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          file: { select: { fileNumber: true, customerName: true, currentLocation: true } },
          dispatchedBy: { select: { firstName: true, lastName: true } },
          return: {
            select: {
              createdAt: true,
              notes: true,
              receivedBy: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.dispatch.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id },
      include: {
        file: {
          select: { fileNumber: true, customerName: true, currentLocation: true, status: true },
        },
        dispatchedBy: { select: { firstName: true, lastName: true, email: true } },
        return: {
          include: { receivedBy: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    return dispatch;
  }
}
