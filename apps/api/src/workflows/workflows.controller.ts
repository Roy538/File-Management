import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { CreateWorkflowInstanceDto, ListWorkflowInstancesDto } from './dto/create-workflow-instance.dto';
import { WorkflowActionDto } from './dto/workflow-action.dto';

@ApiTags('workflows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WorkflowsController {
  constructor(private readonly svc: WorkflowsService) {}

  // ── Definitions ───────────────────────────────────────────────────────────

  @Get('workflow-definitions')
  @ApiOperation({ summary: 'List all active workflow definitions' })
  listDefinitions() {
    return this.svc.listDefinitions();
  }

  @Post('workflow-definitions')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a workflow definition (ADMIN)' })
  createDefinition(@Body() dto: CreateWorkflowDefinitionDto) {
    return this.svc.createDefinition(dto);
  }

  @Delete('workflow-definitions/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft-delete a workflow definition (ADMIN)' })
  deleteDefinition(@Param('id') id: string) {
    return this.svc.deleteDefinition(id);
  }

  // ── Instances ─────────────────────────────────────────────────────────────

  @Get('workflow-instances')
  @ApiOperation({ summary: 'List workflow instances, optionally filtered by documentId or status' })
  listInstances(@Query() q: ListWorkflowInstancesDto) {
    return this.svc.listInstances(q);
  }

  @Get('workflow-instances/:id')
  @ApiOperation({ summary: 'Get full workflow instance details including history' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post('workflow-instances')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Start a workflow instance for a document' })
  startInstance(@Body() dto: CreateWorkflowInstanceDto, @CurrentUser() user: JwtPayload) {
    return this.svc.startInstance(dto, user);
  }

  @Post('workflow-instances/:id/action')
  @ApiOperation({ summary: 'Approve, reject, or cancel a workflow instance' })
  takeAction(
    @Param('id') id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.takeAction(id, dto, user);
  }
}
