import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { FileStatus, FileRequestStatus, Role, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateFileRequestDto } from './dto/create-file-request.dto';
import { UpdateFileRequestDto } from './dto/update-file-request.dto';
import { QueryFileRequestsDto } from './dto/query-file-requests.dto';

@Injectable()
export class FileRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateFileRequestDto, user: JwtPayload) {
    const file = await this.prisma.file.findFirst({
      where: { id: dto.fileId, isActive: true, businessUnitId: user.businessUnitId },
      select: { id: true, fileNumber: true, customerName: true, status: true, businessUnitId: true },
    });
    if (!file) throw new NotFoundException('File not found');

    const request = await this.prisma.fileRequest.create({
      data: {
        fileId: dto.fileId,
        requestedById: user.sub,
        department: dto.department,
        purpose: dto.purpose,
      },
      include: {
        file: { select: { fileNumber: true, customerName: true } },
        requestedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (file.status === FileStatus.DISPATCHED) {
      await this.notifications.notifyDuplicateDispatch(
        file.businessUnitId,
        file.fileNumber,
        user.email,
      );
    }

    return request;
  }

  async findAll(query: QueryFileRequestsDto, user: JwtPayload) {
    const { page = 1, pageSize = 20, status, search } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.FileRequestWhereInput = {
      file: { businessUnitId: user.businessUnitId },
      ...(user.role === Role.DEPT_USER ? { requestedById: user.sub } : {}),
      ...(status ? { status: status as FileRequestStatus } : {}),
      ...(search
        ? {
            OR: [
              { file: { fileNumber: { contains: search, mode: 'insensitive' } } },
              { file: { customerName: { contains: search, mode: 'insensitive' } } },
              { department: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.fileRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          file: { select: { fileNumber: true, customerName: true, status: true, currentLocation: true } },
          requestedBy: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.fileRequest.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string, user: JwtPayload) {
    const req = await this.prisma.fileRequest.findUnique({
      where: { id },
      include: {
        file: { select: { fileNumber: true, customerName: true, status: true, currentLocation: true } },
        requestedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (user.role === Role.DEPT_USER && req.requestedById !== user.sub) {
      throw new ForbiddenException();
    }
    return req;
  }

  async updateStatus(id: string, dto: UpdateFileRequestDto, user: JwtPayload) {
    const req = await this.prisma.fileRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Request not found');

    if (user.role === Role.DEPT_USER) {
      if (req.requestedById !== user.sub || dto.status !== 'CANCELLED') {
        throw new ForbiddenException('Department users may only cancel their own requests');
      }
    }

    return this.prisma.fileRequest.update({
      where: { id },
      data: { status: dto.status as FileRequestStatus, notes: dto.notes },
      include: {
        file: { select: { fileNumber: true, customerName: true } },
        requestedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }
}
