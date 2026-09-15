import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../storage/storage.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { assertDocTransition } from './document-status.machine';

export const OCR_QUEUE = 'ocr';

export interface UploadParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
  title: string;
  folderId?: string;
  subDividerId?: string;
  documentTypeId?: string;
  user: JwtPayload;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(OCR_QUEUE) private readonly ocrQueue: Queue,
  ) {}

  // ── List ──────────────────────────────────────────────────────────────────

  async listDocuments(query: ListDocumentsDto, user: JwtPayload) {
    const where: any = { isActive: true };
    if (query.folderId) where.folderId = query.folderId;
    if (query.subDividerId) where.subDividerId = query.subDividerId;
    if (query.documentTypeId) where.documentTypeId = query.documentTypeId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { ocrText: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.document.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        documentType: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { versions: true } },
      },
    });
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    return this.prisma.document.findFirstOrThrow({
      where: { id, isActive: true },
      include: {
        documentType: true,
        folder: { select: { id: true, name: true, cabinetId: true } },
        subDivider: { select: { id: true, name: true, folderId: true } },
        checkedOutBy: { select: { id: true, firstName: true, lastName: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { document: { select: { id: true } } },
        },
      },
    });
  }

  // ── Upload (new document) ─────────────────────────────────────────────────

  async upload(params: UploadParams) {
    const { buffer, fileName, mimeType, fileSize, title, folderId, subDividerId, documentTypeId, user } = params;

    if (!folderId && !subDividerId) {
      throw new BadRequestException('folderId or subDividerId is required');
    }

    const checksum = createHash('sha256').update(buffer).digest('hex');

    const { doc, version } = await this.prisma.$transaction(async tx => {
      const doc = await tx.document.create({
        data: {
          title,
          folderId: folderId ?? null,
          subDividerId: subDividerId ?? null,
          documentTypeId: documentTypeId ?? null,
          status: DocumentStatus.DRAFT,
        },
      });
      const storageKey = `${user.businessUnitId}/${doc.id}/1/${fileName}`;
      const version = await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          storageKey,
          fileName,
          mimeType,
          fileSize,
          checksum,
          uploadedById: user.sub,
        },
      });
      return { doc, version };
    });

    try {
      await this.storage.upload(version.storageKey, buffer, mimeType);
    } catch (err) {
      await this.prisma.document.update({ where: { id: doc.id }, data: { isActive: false, deletedAt: new Date() } });
      throw err;
    }

    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      await this.ocrQueue.add('process', {
        documentId: doc.id,
        versionId: version.id,
        storageKey: version.storageKey,
        mimeType,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    }

    return doc;
  }

  // ── Upload new version ────────────────────────────────────────────────────

  async uploadVersion(docId: string, params: Omit<UploadParams, 'folderId' | 'subDividerId' | 'documentTypeId' | 'title'>) {
    const doc = await this.prisma.document.findFirstOrThrow({ where: { id: docId, isActive: true } });
    const { buffer, fileName, mimeType, fileSize, user } = params;

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const lastVersion = await this.prisma.documentVersion.findFirst({
      where: { documentId: docId },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;
    const storageKey = `${user.businessUnitId}/${docId}/${nextVersion}/${fileName}`;

    const version = await this.prisma.documentVersion.create({
      data: { documentId: docId, versionNumber: nextVersion, storageKey, fileName, mimeType, fileSize, checksum, uploadedById: user.sub },
    });

    await this.storage.upload(storageKey, buffer, mimeType);

    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      await this.ocrQueue.add('process', {
        documentId: docId, versionId: version.id, storageKey, mimeType,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    }

    return { doc, version };
  }

  // ── Change status ─────────────────────────────────────────────────────────

  async changeStatus(id: string, toStatus: DocumentStatus, user: JwtPayload) {
    const doc = await this.prisma.document.findFirstOrThrow({ where: { id, isActive: true } });
    assertDocTransition(doc.status, toStatus);

    const data: any = { status: toStatus };
    if (toStatus === DocumentStatus.CHECKED_OUT) {
      data.checkedOutById = user.sub;
      data.checkedOutAt = new Date();
    } else if (doc.status === DocumentStatus.CHECKED_OUT) {
      data.checkedOutById = null;
      data.checkedOutAt = null;
    }

    return this.prisma.document.update({ where: { id }, data });
  }

  // ── Download URL ──────────────────────────────────────────────────────────

  async getDownloadUrl(docId: string, versionId: string) {
    const version = await this.prisma.documentVersion.findFirstOrThrow({
      where: { id: versionId, documentId: docId },
    });
    const url = await this.storage.getSignedDownloadUrl(version.storageKey);
    return { url, fileName: version.fileName, mimeType: version.mimeType, expiresIn: 900 };
  }

  // ── Soft delete ───────────────────────────────────────────────────────────

  deleteDocument(id: string) {
    return this.prisma.document.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }

  // ── OCR backfill ──────────────────────────────────────────────────────────

  /** Enqueue OCR jobs for all active documents that don't yet have extracted text. */
  async reindexOcr() {
    const docs = await this.prisma.document.findMany({
      where: { isActive: true, ocrText: null },
      select: {
        id: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: { id: true, storageKey: true, mimeType: true },
        },
      },
    });

    let queued = 0;
    for (const d of docs) {
      const v = d.versions[0];
      if (!v) continue;
      if (v.mimeType !== 'application/pdf' && !v.mimeType.startsWith('image/')) continue;
      await this.ocrQueue.add(
        'process',
        { documentId: d.id, versionId: v.id, storageKey: v.storageKey, mimeType: v.mimeType },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      queued++;
    }
    return { scanned: docs.length, queued };
  }
}
