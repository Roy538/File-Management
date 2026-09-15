import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, WorkflowStatus } from '@prisma/client';
import { WorkflowsService } from './workflows.service';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

// ── Fixtures ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'step-1', name: 'Officer Review', assigneeRole: 'OFFICER', order: 1 },
  { id: 'step-2', name: 'Admin Approval', assigneeRole: 'ADMIN', order: 2 },
];

const MOCK_DEF = {
  id: 'def-1',
  name: 'Two-Step Approval',
  steps: STEPS,
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeInstance(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'inst-1',
    workflowDefinitionId: 'def-1',
    documentId: 'doc-1',
    status: WorkflowStatus.IN_PROGRESS,
    currentState: 'step-1',
    initiatedById: 'user-officer',
    history: [],
    workflowDefinition: MOCK_DEF,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const officer: JwtPayload = { sub: 'user-officer', email: 'officer@test.com', role: Role.OFFICER, branchId: 'br-1', businessUnitId: 'bu-1' };
const admin: JwtPayload   = { sub: 'user-admin',   email: 'admin@test.com',   role: Role.ADMIN,   branchId: 'br-1', businessUnitId: 'bu-1' };
const dept: JwtPayload    = { sub: 'user-dept',    email: 'dept@test.com',    role: Role.DEPT_USER, branchId: 'br-1', businessUnitId: 'bu-1' };

// ── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      workflowDefinition: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workflowInstance: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ firstName: 'Test', lastName: 'Actor' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(WorkflowsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── startInstance ──────────────────────────────────────────────────────────

  describe('startInstance', () => {
    it('creates an instance with the first step as currentState', async () => {
      prisma.workflowDefinition.findFirst.mockResolvedValue(MOCK_DEF);
      const createdInstance = makeInstance();
      prisma.workflowInstance.create.mockResolvedValue(createdInstance);

      const result = await service.startInstance(
        { workflowDefinitionId: 'def-1', documentId: 'doc-1' },
        officer,
      );

      expect(prisma.workflowInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentState: 'step-1',
            status: WorkflowStatus.IN_PROGRESS,
            initiatedById: officer.sub,
          }),
        }),
      );
      expect(result.currentState).toBe('step-1');
    });

    it('picks the lowest-order step even if steps are out of order in JSON', async () => {
      const reversed = {
        ...MOCK_DEF,
        steps: [STEPS[1], STEPS[0]], // order 2 first, then order 1
      };
      prisma.workflowDefinition.findFirst.mockResolvedValue(reversed);
      prisma.workflowInstance.create.mockResolvedValue(makeInstance());

      await service.startInstance({ workflowDefinitionId: 'def-1', documentId: 'doc-1' }, officer);

      expect(prisma.workflowInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentState: 'step-1' }),
        }),
      );
    });

    it('throws NotFoundException when definition does not exist', async () => {
      prisma.workflowDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.startInstance({ workflowDefinitionId: 'missing', documentId: 'doc-1' }, officer),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when definition has no steps', async () => {
      prisma.workflowDefinition.findFirst.mockResolvedValue({ ...MOCK_DEF, steps: [] });

      await expect(
        service.startInstance({ workflowDefinitionId: 'def-1', documentId: 'doc-1' }, officer),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── takeAction — guard checks ──────────────────────────────────────────────

  describe('takeAction — guard checks', () => {
    it('throws NotFoundException when instance is missing', async () => {
      prisma.workflowInstance.findFirst.mockResolvedValue(null);

      await expect(service.takeAction('bad-id', { action: 'APPROVE' }, officer)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when instance is not IN_PROGRESS', async () => {
      prisma.workflowInstance.findFirst.mockResolvedValue(
        makeInstance({ status: WorkflowStatus.APPROVED }),
      );

      await expect(service.takeAction('inst-1', { action: 'APPROVE' }, officer)).rejects.toThrow(BadRequestException);
    });
  });

  // ── takeAction — CANCEL ───────────────────────────────────────────────────

  describe('takeAction — CANCEL', () => {
    beforeEach(() => {
      prisma.workflowInstance.findFirst.mockResolvedValue(makeInstance());
      prisma.workflowInstance.update.mockResolvedValue(
        makeInstance({ status: WorkflowStatus.CANCELLED, currentState: null }),
      );
    });

    it('allows the initiator to cancel', async () => {
      await expect(
        service.takeAction('inst-1', { action: 'CANCEL' }, officer),
      ).resolves.not.toThrow();

      expect(prisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: WorkflowStatus.CANCELLED }),
        }),
      );
    });

    it('allows ADMIN to cancel even as a non-initiator', async () => {
      await expect(
        service.takeAction('inst-1', { action: 'CANCEL' }, admin),
      ).resolves.not.toThrow();
    });

    it('blocks a non-initiator OFFICER from cancelling', async () => {
      const otherOfficer: JwtPayload = { ...officer, sub: 'user-other' };

      await expect(
        service.takeAction('inst-1', { action: 'CANCEL' }, otherOfficer),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows DEPT_USER to cancel a workflow they initiated', async () => {
      prisma.workflowInstance.findFirst.mockResolvedValue(
        makeInstance({ initiatedById: dept.sub }),
      );
      prisma.workflowInstance.update.mockResolvedValue(
        makeInstance({ status: WorkflowStatus.CANCELLED, currentState: null }),
      );

      await expect(
        service.takeAction('inst-1', { action: 'CANCEL' }, dept),
      ).resolves.not.toThrow();
    });

    it('blocks DEPT_USER who is not the initiator from cancelling', async () => {
      // instance.initiatedById = 'user-officer', dept.sub = 'user-dept' — not the initiator
      await expect(
        service.takeAction('inst-1', { action: 'CANCEL' }, dept),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── takeAction — REJECT ───────────────────────────────────────────────────

  describe('takeAction — REJECT', () => {
    beforeEach(() => {
      prisma.workflowInstance.findFirst.mockResolvedValue(makeInstance());
      prisma.workflowInstance.update.mockResolvedValue(
        makeInstance({ status: WorkflowStatus.REJECTED, currentState: null }),
      );
    });

    it('allows the assignee role (OFFICER) to reject step-1', async () => {
      await expect(
        service.takeAction('inst-1', { action: 'REJECT' }, officer),
      ).resolves.not.toThrow();

      expect(prisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: WorkflowStatus.REJECTED }),
        }),
      );
    });

    it('allows ADMIN to reject any step regardless of assigneeRole', async () => {
      await expect(
        service.takeAction('inst-1', { action: 'REJECT' }, admin),
      ).resolves.not.toThrow();
    });

    it('blocks a user with the wrong role from rejecting', async () => {
      await expect(
        service.takeAction('inst-1', { action: 'REJECT' }, dept),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── takeAction — APPROVE ──────────────────────────────────────────────────

  describe('takeAction — APPROVE', () => {
    it('advances currentState to the next step', async () => {
      prisma.workflowInstance.findFirst.mockResolvedValue(makeInstance());
      prisma.workflowInstance.update.mockResolvedValue(
        makeInstance({ currentState: 'step-2', status: WorkflowStatus.IN_PROGRESS }),
      );

      await service.takeAction('inst-1', { action: 'APPROVE' }, officer);

      expect(prisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WorkflowStatus.IN_PROGRESS,
            currentState: 'step-2',
          }),
        }),
      );
    });

    it('sets status to APPROVED when approving the last step', async () => {
      prisma.workflowInstance.findFirst.mockResolvedValue(
        makeInstance({ currentState: 'step-2' }),
      );
      prisma.workflowInstance.update.mockResolvedValue(
        makeInstance({ currentState: null, status: WorkflowStatus.APPROVED }),
      );

      await service.takeAction('inst-1', { action: 'APPROVE' }, admin);

      expect(prisma.workflowInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WorkflowStatus.APPROVED,
            currentState: null,
          }),
        }),
      );
    });

    it('appends a history entry with actor name and timestamp', async () => {
      prisma.workflowInstance.findFirst.mockResolvedValue(makeInstance());
      prisma.workflowInstance.update.mockImplementation(({ data }: any) => Promise.resolve(data));

      await service.takeAction('inst-1', { action: 'APPROVE', comment: 'LGTM' }, officer);

      const call = prisma.workflowInstance.update.mock.calls[0][0];
      const history = call.data.history as any[];
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        action: 'APPROVED',
        userId: officer.sub,
        userFullName: 'Test Actor',
        comment: 'LGTM',
      });
      expect(history[0].timestamp).toBeDefined();
    });

    it('blocks DEPT_USER from approving even when they match assigneeRole indirectly', async () => {
      // step-1 requires OFFICER; DEPT_USER is not OFFICER, so blocked
      prisma.workflowInstance.findFirst.mockResolvedValue(makeInstance());

      await expect(
        service.takeAction('inst-1', { action: 'APPROVE' }, dept),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
