import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DocumentStatus } from '@prisma/client';

export class ListDocumentsDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  subDividerId?: string;

  @IsOptional()
  @IsString()
  documentTypeId?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
