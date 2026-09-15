import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  businessUnitId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}
