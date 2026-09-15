import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { FileRequestsService } from './file-requests.service';
import { CreateFileRequestDto } from './dto/create-file-request.dto';
import { UpdateFileRequestDto } from './dto/update-file-request.dto';
import { QueryFileRequestsDto } from './dto/query-file-requests.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('file-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('file-requests')
export class FileRequestsController {
  constructor(private readonly service: FileRequestsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Submit a file request' })
  create(@Body() dto: CreateFileRequestDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'List file requests (DEPT_USER sees own; officers see all in BU)' })
  findAll(@Query() query: QueryFileRequestsDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Get a single file request' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(id, user);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Approve / reject / cancel a file request' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFileRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateStatus(id, dto, user);
  }
}
