import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly isMinio: boolean;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {
    const driver = config.get<string>('STORAGE_DRIVER') ?? 'minio';
    const isMinio = driver === 'minio';
    this.isMinio = isMinio;

    this.s3 = new S3Client({
      endpoint: isMinio ? (config.get<string>('MINIO_ENDPOINT') ?? 'http://localhost:9000') : undefined,
      region: config.get<string>('AWS_REGION') ?? 'us-east-1',
      forcePathStyle: isMinio,
      credentials: {
        accessKeyId: isMinio
          ? (config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin')
          : (config.get<string>('AWS_ACCESS_KEY_ID') ?? ''),
        secretAccessKey: isMinio
          ? (config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin')
          : (config.get<string>('AWS_SECRET_ACCESS_KEY') ?? ''),
      },
    });

    this.bucket = isMinio
      ? (config.get<string>('MINIO_BUCKET') ?? 'fts-documents')
      : (config.get<string>('S3_BUCKET') ?? 'fts-documents');
  }

  /**
   * Provision the storage bucket on boot. A missing bucket is created; an
   * unreachable backend logs a warning rather than crashing startup, so the
   * API still comes up (uploads will surface the error when attempted).
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (err) {
      this.logger.warn(
        `Could not ensure bucket "${this.bucket}" at startup — storage backend may be unavailable. ` +
          `Uploads will fail until it is reachable. (${(err as Error).message})`,
      );
    }
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket: ${this.bucket}`);
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // AES-256 SSE applied on real S3 only; MinIO handles encryption separately
      ...(!this.isMinio && { ServerSideEncryption: 'AES256' as const }),
    }));
  }

  getSignedDownloadUrl(key: string, expiresIn = 900): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }
}
