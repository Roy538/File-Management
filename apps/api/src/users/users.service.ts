import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

const SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  branchId: true,
  businessUnitId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { name: true, code: true } },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        branchId: dto.branchId,
        businessUnitId: dto.businessUnitId,
      },
      select: SELECT,
    });
  }

  findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    return Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true },
        select: SELECT,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
    ]).then(([data, total]) => ({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isActive: true },
      select: SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SELECT,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }
}
