import { Controller, Get, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TrackingService } from './tracking.service';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tracking')
export class TrackingController {
  constructor(private readonly service: TrackingService) {}

  @Get('files/:fileId/movements')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Paginated movement history for a file' })
  getMovements(
    @Param('fileId') fileId: string,
    @Query() query: QueryMovementsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getMovements(fileId, query, user);
  }

  @Patch('files/:fileId/location')
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Update file current location (creates RELOCATED movement)' })
  updateLocation(
    @Param('fileId') fileId: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateLocation(fileId, dto, user);
  }
}
