import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDispatchDto {
  @ApiProperty()
  @IsString()
  dispatchedTo!: string;

  @ApiProperty()
  @IsString()
  department!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expectedReturnAt?: string;

  @ApiProperty({ required: false, description: 'ID of user who authorized the release' })
  @IsOptional()
  @IsString()
  authorizedById?: string;
}
