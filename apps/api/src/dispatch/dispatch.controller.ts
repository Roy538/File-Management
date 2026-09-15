import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DispatchService } from './dispatch.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { QueryDispatchesDto } from './dto/query-dispatches.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('dispatches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dispatches')
export class DispatchController {
  constructor(private readonly service: DispatchService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'List dispatches (pending or all, scoped to BU)' })
  findAll(@Query() query: QueryDispatchesDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Get dispatch detail' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('file/:fileId')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Dispatch a file (creates Dispatch record + sets status to DISPATCHED)' })
  dispatch(
    @Param('fileId') fileId: string,
    @Body() dto: CreateDispatchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.dispatch(fileId, dto, user);
  }

  @Post(':id/return')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Record a return (creates Return record + sets status to RETURNED)' })
  recordReturn(
    @Param('id') id: string,
    @Body() dto: CreateReturnDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.recordReturn(id, dto, user);
  }
}
