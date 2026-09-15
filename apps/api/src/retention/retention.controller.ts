import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RetentionService } from './retention.service';

@ApiTags('retention')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller()
export class RetentionController {
  constructor(private readonly svc: RetentionService) {}

  @Post('retention/sweep')
  @ApiOperation({ summary: 'Manually trigger a retention sweep (ADMIN)' })
  runSweep() {
    return this.svc.runSweep();
  }
}
