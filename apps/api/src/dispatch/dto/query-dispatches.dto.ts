import { IsOptional, IsInt, Min, Max, IsUUID, IsBoolean, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class QueryDispatchesDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  fileId?: string;

  @ApiProperty({ required: false, description: 'true = pending only, false = completed only, omit = all' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  pending?: boolean;

  @ApiProperty({ required: false, description: 'Search by file number, customer name, or dispatched-to name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter by department name' })
  @IsOptional()
  @IsString()
  department?: string;
}
