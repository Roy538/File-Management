import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FileStatus, FileMovementAction, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async getMovements(fileId: string, query: QueryMovementsDto, user: JwtPayload) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, businessUnitId: user.businessUnitId, isActive: true },
    });
    if (!file) throw new NotFoundException('File not found');

    const { page = 1, pageSize = 20, action } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.FileMovementWhereInput = {
      fileId,
      ...(action ? { action } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.fileMovement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fileMovement.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async updateLocation(fileId: string, dto: UpdateLocationDto, user: JwtPayload) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, businessUnitId: user.businessUnitId, isActive: true },
    });
    if (!file) throw new NotFoundException('File not found');

    if (file.status === FileStatus.DISPATCHED) {
      throw new BadRequestException('Cannot manually relocate a dispatched file — record its return first');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.file.update({
        where: { id: fileId },
        data: { currentLocation: dto.location },
      });

      await tx.fileMovement.create({
        data: {
          fileId,
          action: FileMovementAction.RELOCATED,
          performedById: user.sub,
          fromLocation: file.currentLocation,
          toLocation: dto.location,
          notes: dto.notes,
        },
      });

      return updated;
    });
  }
}
