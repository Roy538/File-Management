import * as crypto from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ESignatureStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateESignatureDto, SignerDto } from './dto/create-esignature.dto';

@Injectable()
export class ESignatureService {
  private readonly logger = new Logger(ESignatureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateESignatureDto) {
    const doc = await this.prisma.document.findFirst({
      where: { id: dto.documentId, isActive: true },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const request = await this.prisma.eSignatureRequest.create({
      data: {
        documentId: dto.documentId,
        signers: dto.signers as any,
        status: ESignatureStatus.PENDING,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    const documensoUrl = this.config.get<string>('DOCUMENSO_API_URL');
    const documensoKey = this.config.get<string>('DOCUMENSO_API_KEY');

    if (documensoUrl && documensoKey && doc.versions.length > 0) {
      this.sendToDocumenso(
        request.id,
        doc.title,
        doc.versions[0].storageKey,
        dto.signers,
        dto.redirectUrl,
      ).catch(err =>
        this.logger.warn(`Documenso integration skipped: ${err.message}`),
      );
    }

    return request;
  }

  listForDocument(documentId: string) {
    return this.prisma.eSignatureRequest.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(id: string) {
    const req = await this.prisma.eSignatureRequest.findFirst({ where: { id } });
    if (!req) throw new NotFoundException('Signing request not found');
    if (req.status !== ESignatureStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be cancelled');
    }
    return this.prisma.eSignatureRequest.update({
      where: { id },
      data: { status: ESignatureStatus.DECLINED },
    });
  }

  async handleWebhook(rawBody: string, signature: string) {
    const secret = this.config.get<string>('DOCUMENSO_WEBHOOK_SECRET');
    if (secret && signature) {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const externalId: string | undefined = payload.data?.externalId;
    if (!externalId) return { ok: true };

    const newStatus =
      payload.event === 'DOCUMENT_COMPLETED'
        ? ESignatureStatus.COMPLETED
        : payload.event === 'DOCUMENT_DECLINED'
          ? ESignatureStatus.DECLINED
          : null;

    if (newStatus) {
      await this.prisma.eSignatureRequest.updateMany({
        where: { id: externalId },
        data: {
          status: newStatus,
          completedAt: newStatus === ESignatureStatus.COMPLETED ? new Date() : undefined,
        },
      });
    }

    return { ok: true };
  }

  // ── Documenso integration ──────────────────────────────────────────────────

  private async sendToDocumenso(
    requestId: string,
    title: string,
    storageKey: string,
    signers: SignerDto[],
    redirectUrl?: string,
  ) {
    const baseUrl = this.config.get<string>('DOCUMENSO_API_URL')!;
    const apiKey = this.config.get<string>('DOCUMENSO_API_KEY')!;
    const authHeader = { Authorization: `Bearer ${apiKey}` };

    // Download PDF from storage
    const signedUrl = await this.storage.getSignedDownloadUrl(storageKey);
    const pdfRes = await firstValueFrom(
      this.http.get<Buffer>(signedUrl, { responseType: 'arraybuffer' }),
    );

    // Build multipart form for Documenso
    const { FormData, Blob } = await import('node:buffer' as any).catch(() => ({
      FormData: globalThis.FormData,
      Blob: globalThis.Blob,
    }));
    const form = new FormData();
    form.append(
      'document',
      new Blob([pdfRes.data], { type: 'application/pdf' }),
      `${title}.pdf`,
    );
    form.append('title', title);
    form.append('externalId', requestId);
    signers.forEach((s, i) => {
      form.append(`recipients[${i}][email]`, s.email);
      form.append(`recipients[${i}][name]`, s.name);
      form.append(`recipients[${i}][role]`, 'SIGNER');
    });
    if (redirectUrl) form.append('redirectUrl', redirectUrl);

    const res = await firstValueFrom(
      this.http.post<{ id: number }>(`${baseUrl}/api/v1/documents`, form, {
        headers: authHeader,
      }),
    );

    await this.prisma.eSignatureRequest.update({
      where: { id: requestId },
      data: { externalProviderId: String(res.data.id) },
    });
  }
}
