import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocumentStatus, RetentionAction, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledSweep() {
    this.logger.log('Starting scheduled retention sweep');
    const { processed, errors } = await this.runSweep();
    this.logger.log(`Retention sweep complete: ${processed} processed, ${errors} errors`);
  }

  /** Manually trigger a retention sweep (ADMIN endpoint). */
  async runSweep(): Promise<{ processed: number; errors: number }> {
    const now = new Date();
    let processed = 0;
    let errors = 0;

    // ── Folder-based documents ─────────────────────────────────────────────
    const folderDocs = await this.prisma.document.findMany({
      where: {
        isActive: true,
        status: { not: DocumentStatus.ARCHIVED },
        folderId: { not: null },
        folder: {
          isActive: true,
          cabinet: { isActive: true, retentionPolicyId: { not: null } },
        },
      },
      include: {
        folder: {
          include: {
            cabinet: { include: { retentionPolicy: true } },
          },
        },
      },
    });

    // ── SubDivider-based documents ─────────────────────────────────────────
    const sdDocs = await this.prisma.document.findMany({
      where: {
        isActive: true,
        status: { not: DocumentStatus.ARCHIVED },
        subDividerId: { not: null },
        subDivider: {
          isActive: true,
          folder: {
            isActive: true,
            cabinet: { isActive: true, retentionPolicyId: { not: null } },
          },
        },
      },
      include: {
        subDivider: {
          include: {
            folder: {
              include: {
                cabinet: { include: { retentionPolicy: true } },
              },
            },
          },
        },
      },
    });

    for (const doc of folderDocs) {
      const policy = doc.folder?.cabinet?.retentionPolicy;
      const cabinet = doc.folder?.cabinet;
      if (!policy || !cabinet) continue;
      const expiresAt = new Date(doc.createdAt.getTime() + policy.retentionDays * 86_400_000);
      if (expiresAt > now) continue;
      try { await this.applyPolicy(doc, policy, cabinet); processed++; }
      catch (err: any) { this.logger.error(`Retention error on ${doc.id}: ${err.message}`); errors++; }
    }

    for (const doc of sdDocs) {
      const policy = doc.subDivider?.folder?.cabinet?.retentionPolicy;
      const cabinet = doc.subDivider?.folder?.cabinet;
      if (!policy || !cabinet) continue;
      const expiresAt = new Date(doc.createdAt.getTime() + policy.retentionDays * 86_400_000);
      if (expiresAt > now) continue;
      try { await this.applyPolicy(doc, policy, cabinet); processed++; }
      catch (err: any) { this.logger.error(`Retention error on ${doc.id}: ${err.message}`); errors++; }
    }

    return { processed, errors };
  }

  private async applyPolicy(
    doc: { id: string; title: string; createdAt: Date },
    policy: { action: RetentionAction; retentionDays: number; name: string },
    cabinet: { name: string; businessUnitId: string },
  ) {
    if (policy.action === RetentionAction.ARCHIVE) {
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: DocumentStatus.ARCHIVED },
      });
      this.logger.log(`Archived document ${doc.id} (${doc.title}) per policy "${policy.name}"`);
    } else if (policy.action === RetentionAction.DELETE) {
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { isActive: false, deletedAt: new Date() },
      });
      this.logger.log(`Soft-deleted document ${doc.id} (${doc.title}) per policy "${policy.name}"`);
    } else if (policy.action === RetentionAction.NOTIFY) {
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN, businessUnitId: cabinet.businessUnitId, isActive: true },
        select: { id: true },
      });

      if (admins.length > 0) {
        await this.prisma.notification.createMany({
          data: admins.map(admin => ({
            userId: admin.id,
            title: 'Retention Policy: Document Overdue for Review',
            message:
              `"${doc.title}" in cabinet "${cabinet.name}" has exceeded its ` +
              `retention period of ${policy.retentionDays} days ` +
              `(created ${doc.createdAt.toLocaleDateString()}).`,
          })),
          skipDuplicates: true,
        });
      }
      this.logger.log(
        `Notified ${admins.length} admin(s) about document ${doc.id} (${doc.title})`,
      );
    }
  }
}
