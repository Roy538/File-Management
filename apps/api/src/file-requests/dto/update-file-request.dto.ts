import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFileRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'CANCELLED'] })
  @IsIn(['APPROVED', 'REJECTED', 'CANCELLED'])
  status!: 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
