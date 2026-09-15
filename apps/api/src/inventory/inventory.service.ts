import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { FileStatus, FileMovementAction, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { QueryFilesDto } from './dto/query-files.dto';
import { assertTransition } from './file-status.machine';

function toMovementAction(to: FileStatus): FileMovementAction {
  switch (to) {
    case FileStatus.DISPATCHED: return FileMovementAction.DISPATCHED;
    case FileStatus.RETURNED:   return FileMovementAction.RETURNED;
    case FileStatus.ARCHIVED:   return FileMovementAction.ARCHIVED;
    case FileStatus.MISSING:    return FileMovementAction.FLAGGED_MISSING;
    default:                    return FileMovementAction.RECOVERED;
  }
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryFilesDto, user: JwtPayload) {
    const { page = 1, pageSize = 20, search, status, branchId, holder, dispatchedFrom, dispatchedTo } = query;
    const skip = (page - 1) * pageSize;

    const fromDate = dispatchedFrom ? new Date(dispatchedFrom) : undefined;
    const toDate = dispatchedTo ? new Date(dispatchedTo + 'T23:59:59.999Z') : undefined;

    const where: Prisma.FileWhereInput = {
      isActive: true,
      businessUnitId: user.businessUnitId,
      ...(user.role !== Role.ADMIN && { branchId: user.branchId }),
      ...(status && { status }),
      ...(branchId && user.role === Role.ADMIN && { branchId }),
      ...(search && {
        OR: [
          { fileNumber: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(holder && {
        dispatches: {
          some: {
            actualReturnAt: null,
            dispatchedTo: { contains: holder, mode: 'insensitive' },
          },
        },
      }),
      ...((fromDate || toDate) && {
        dispatches: {
          some: {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          },
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.file.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.file.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const file = await this.prisma.file.findFirst({
      where: { id, isActive: true },
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
        branch: { select: { name: true, code: true } },
        businessUnit: { select: { name: true, code: true } },
        dispatches: {
          where: { actualReturnAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, dispatchedTo: true, department: true, createdAt: true },
        },
      },
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async create(dto: CreateFileDto) {
    return this.prisma.file.create({
      data: {
        fileNumber: dto.fileNumber,
        customerName: dto.customerName,
        businessUnitId: dto.businessUnitId,
        branchId: dto.branchId,
        currentLocation: dto.currentLocation,
        volumeNumber: dto.volumeNumber ?? 1,
        status: FileStatus.AVAILABLE,
      },
    });
  }

  async update(id: string, dto: UpdateFileDto, user: JwtPayload) {
    const file = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.file.update({ where: { id }, data: dto });

      if (dto.currentLocation && dto.currentLocation !== file.currentLocation) {
        await tx.fileMovement.create({
          data: {
            fileId: id,
            action: FileMovementAction.RELOCATED,
            performedById: user.sub,
            fromLocation: file.currentLocation,
            toLocation: dto.currentLocation,
          },
        });
      }

      return updated;
    });
  }

  async changeStatus(id: string, dto: ChangeStatusDto, user: JwtPayload) {
    const file = await this.findOne(id);

    if (file.status === FileStatus.ARCHIVED && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can restore archived files');
    }

    assertTransition(file.status, dto.status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.file.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.fileMovement.create({
        data: {
          fileId: id,
          action: toMovementAction(dto.status),
          performedById: user.sub,
          fromLocation: file.currentLocation,
          toLocation: file.currentLocation,
          notes: dto.reason,
        },
      });
      return updated;
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.file.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }
}
