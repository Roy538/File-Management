import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  CreateWorkflowDefinitionDto,
  WorkflowStepDto,
} from './dto/create-workflow-definition.dto';
import { CreateWorkflowInstanceDto, ListWorkflowInstancesDto } from './dto/create-workflow-instance.dto';
import { WorkflowActionDto } from './dto/workflow-action.dto';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Definitions ───────────────────────────────────────────────────────────

  createDefinition(dto: CreateWorkflowDefinitionDto) {
    const validRoles = Object.values(Role) as string[];
    for (const step of dto.steps) {
      if (!validRoles.includes(step.assigneeRole)) {
        throw new BadRequestException(
          `Invalid assigneeRole "${step.assigneeRole}" in step "${step.name}". Must be one of: ${validRoles.join(', ')}`,
        );
      }
    }
    return this.prisma.workflowDefinition.create({
      data: { name: dto.name, steps: dto.steps as any },
    });
  }

  listDefinitions() {
    return this.prisma.workflowDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { instances: true } } },
    });
  }

  async deleteDefinition(id: string) {
    const def = await this.prisma.workflowDefinition.findFirst({ where: { id } });
    if (!def) throw new NotFoundException('Workflow definition not found');
    return this.prisma.workflowDefinition.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  // ── Instances ─────────────────────────────────────────────────────────────

  async startInstance(dto: CreateWorkflowInstanceDto, user: JwtPayload) {
    const def = await this.prisma.workflowDefinition.findFirst({
      where: { id: dto.workflowDefinitionId, isActive: true },
    });
    if (!def) throw new NotFoundException('Workflow definition not found');

    const steps = (def.steps as unknown as WorkflowStepDto[]).sort((a, b) => a.order - b.order);
    if (!steps.length) throw new BadRequestException('Workflow definition has no steps');

    return this.prisma.workflowInstance.create({
      data: {
        workflowDefinitionId: dto.workflowDefinitionId,
        documentId: dto.documentId,
        status: WorkflowStatus.IN_PROGRESS,
        currentState: steps[0].id,
        initiatedById: user.sub,
        history: [],
      },
      include: this.instanceIncludes(),
    });
  }

  findOne(id: string) {
    return this.prisma.workflowInstance.findFirstOrThrow({
      where: { id },
      include: {
        ...this.instanceIncludes(),
        workflowDefinition: true,
      },
    });
  }

  listInstances(query: ListWorkflowInstancesDto) {
    const where: any = {};
    if (query.documentId) where.documentId = query.documentId;
    if (query.status) where.status = query.status;

    return this.prisma.workflowInstance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        workflowDefinition: { select: { id: true, name: true, steps: true } },
        document: { select: { id: true, title: true, status: true } },
        initiatedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async takeAction(id: string, dto: WorkflowActionDto, user: JwtPayload) {
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id },
      include: { workflowDefinition: true },
    });
    if (!instance) throw new NotFoundException('Workflow instance not found');

    if (instance.status !== WorkflowStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot act on a ${instance.status} workflow instance`,
      );
    }

    // Look up actor full name for history record
    const actor = await this.prisma.user.findFirstOrThrow({
      where: { id: user.sub },
      select: { firstName: true, lastName: true },
    });

    if (dto.action === 'CANCEL') {
      if (instance.initiatedById !== user.sub && user.role !== Role.ADMIN) {
        throw new ForbiddenException('Only the initiator or an ADMIN can cancel this workflow');
      }
      return this.updateWithHistory(instance, {
        status: WorkflowStatus.CANCELLED,
        currentState: null,
        historyEntry: {
          stepId: instance.currentState ?? 'n/a',
          stepName: 'Cancelled',
          action: 'CANCELLED',
          userId: user.sub,
          userFullName: `${actor.firstName} ${actor.lastName}`,
          comment: dto.comment,
        },
      });
    }

    // APPROVE / REJECT — verify assignee role
    const steps = (instance.workflowDefinition.steps as unknown as WorkflowStepDto[]).sort(
      (a, b) => a.order - b.order,
    );
    const currentStep = steps.find(s => s.id === instance.currentState);
    if (!currentStep) throw new BadRequestException('Current workflow step not found in definition');

    if (user.role !== Role.ADMIN && user.role !== (currentStep.assigneeRole as Role)) {
      throw new ForbiddenException(
        `This step requires role ${currentStep.assigneeRole}`,
      );
    }

    if (dto.action === 'REJECT') {
      return this.updateWithHistory(instance, {
        status: WorkflowStatus.REJECTED,
        currentState: null,
        historyEntry: {
          stepId: currentStep.id,
          stepName: currentStep.name,
          action: 'REJECTED',
          userId: user.sub,
          userFullName: `${actor.firstName} ${actor.lastName}`,
          comment: dto.comment,
        },
      });
    }

    // APPROVE — advance to next step or mark complete
    const currentIndex = steps.findIndex(s => s.id === instance.currentState);
    const nextStep = steps[currentIndex + 1];

    const result = await this.updateWithHistory(instance, {
      status: nextStep ? WorkflowStatus.IN_PROGRESS : WorkflowStatus.APPROVED,
      currentState: nextStep ? nextStep.id : null,
      historyEntry: {
        stepId: currentStep.id,
        stepName: currentStep.name,
        action: 'APPROVED',
        userId: user.sub,
        userFullName: `${actor.firstName} ${actor.lastName}`,
        comment: dto.comment,
      },
    });

    // Notify users who can action the next step
    if (nextStep) {
      this.notifications
        .createForWorkflowStep(user.businessUnitId, nextStep.assigneeRole, nextStep.name, instance.id)
        .catch(err => this.logger.error('Failed to send workflow step notification', err));
    }

    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private instanceIncludes() {
    return {
      workflowDefinition: { select: { id: true, name: true, steps: true } },
      document: { select: { id: true, title: true, status: true } },
      initiatedBy: { select: { id: true, firstName: true, lastName: true } },
    } as const;
  }

  private updateWithHistory(
    instance: { id: string; history: any },
    opts: {
      status: WorkflowStatus;
      currentState: string | null;
      historyEntry: Record<string, any>;
    },
  ) {
    const entry = { ...opts.historyEntry, timestamp: new Date().toISOString() };
    return this.prisma.workflowInstance.update({
      where: { id: instance.id },
      data: {
        status: opts.status,
        currentState: opts.currentState,
        history: [...(instance.history as any[]), entry] as any,
      },
    });
  }
}
