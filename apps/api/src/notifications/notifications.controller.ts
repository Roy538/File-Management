import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'List notifications for the current user' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(user, Number(page) || 1, Number(pageSize) || 20);
  }

  @Get('unread-count')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.service.getUnreadCount(user.sub);
  }

  @Patch(':id/read')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.markRead(id, user.sub);
  }

  @Patch('read-all')
  @Roles(Role.ADMIN, Role.OFFICER, Role.DEPT_USER)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.service.markAllRead(user.sub);
  }
}
