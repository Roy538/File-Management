import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { QueryFilesDto } from './dto/query-files.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'List files (scoped to user BU / branch)' })
  findAll(@Query() query: QueryFilesDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Get a file with movement history' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Register a new file' })
  create(@Body() dto: CreateFileDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Update file metadata' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Change file status (state-machine validated)' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.changeStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a file (ADMIN only)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
