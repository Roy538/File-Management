import { IsString, IsNotEmpty, IsOptional, IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateFileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileNumber!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @ApiProperty()
  @IsUUID()
  businessUnitId!: string;

  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currentLocation?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  volumeNumber?: number;
}
