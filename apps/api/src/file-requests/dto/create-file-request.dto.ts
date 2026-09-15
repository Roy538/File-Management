import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFileRequestDto {
  @ApiProperty()
  @IsString()
  fileId!: string;

  @ApiProperty()
  @IsString()
  department!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  purpose?: string;
}
