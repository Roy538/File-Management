import { IsEnum, IsOptional, IsString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FileStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryFilesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: FileStatus })
  @IsEnum(FileStatus)
  @IsOptional()
  status?: FileStatus;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by current holder (dispatchedTo on open dispatch)' })
  @IsString()
  @IsOptional()
  holder?: string;

  @ApiPropertyOptional({ description: 'Filter: dispatched on or after this date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  dispatchedFrom?: string;

  @ApiPropertyOptional({ description: 'Filter: dispatched on or before this date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  dispatchedTo?: string;
}
