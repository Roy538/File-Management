import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileStatus } from '@prisma/client';

export class ChangeStatusDto {
  @ApiProperty({ enum: FileStatus })
  @IsEnum(FileStatus)
  status!: FileStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}
