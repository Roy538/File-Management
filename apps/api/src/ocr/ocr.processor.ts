import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OCR_QUEUE } from '../documents/documents.service';

export interface OcrJobData {
  documentId: string;
  versionId: string;
  storageKey: string;
  mimeType: string;
}

/** Extract the embedded text layer of a PDF locally (no external OCR engine). */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? '').replace(/\r\n/g, '\n').trim();
  } finally {
    await parser.destroy();
  }
}

@Processor(OCR_QUEUE)
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly http: HttpService,
  ) {
    super();
  }

  async process(job: Job<OcrJobData>): Promise<void> {
    const { documentId, storageKey, mimeType } = job.data;

    // 1) Fetch the file bytes from storage.
    let buffer: Buffer;
    try {
      const signedUrl = await this.storage.getSignedDownloadUrl(storageKey);
      const fileRes = await firstValueFrom(
        this.http.get<ArrayBuffer>(signedUrl, { responseType: 'arraybuffer' }),
      );
      buffer = Buffer.from(fileRes.data as ArrayBuffer);
    } catch (err) {
      this.logger.error(`OCR: could not download ${documentId}: ${(err as Error).message}`);
      return;
    }

    let text = '';

    // 2) Preferred path: the external OCR worker (handles scanned images via Tesseract).
    const ocrWorkerUrl = process.env.OCR_WORKER_URL;
    if (ocrWorkerUrl) {
      try {
        const ocrRes = await firstValueFrom(
          this.http.post<{ text: string }>(
            `${ocrWorkerUrl}/ocr`,
            { data: buffer.toString('base64'), mimeType },
            { timeout: 30_000 },
          ),
        );
        text = (ocrRes.data?.text ?? '').trim();
      } catch (err) {
        this.logger.warn(
          `OCR worker unavailable for ${documentId} (${(err as Error).message}) — falling back to local extraction`,
        );
      }
    }

    // 3) Local fallback for PDFs: pull the embedded text layer in-process.
    if (!text && mimeType === 'application/pdf') {
      try {
        text = await extractPdfText(buffer);
      } catch (err) {
        this.logger.warn(`Local PDF text extraction failed for ${documentId}: ${(err as Error).message}`);
      }
    }

    if (text) {
      await this.prisma.document.update({ where: { id: documentId }, data: { ocrText: text } });
      this.logger.log(`OCR complete for ${documentId}: ${text.length} chars`);
    } else {
      this.logger.log(
        `OCR produced no text for ${documentId} (mime=${mimeType}). ` +
          `Scanned images need the OCR worker (Tesseract) to be running.`,
      );
    }
  }
}
