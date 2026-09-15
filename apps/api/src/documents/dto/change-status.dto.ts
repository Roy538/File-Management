import { IsEnum } from 'class-validator';
import { DocumentStatus } from '@prisma/client';

export class ChangeStatusDto {
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;
}
