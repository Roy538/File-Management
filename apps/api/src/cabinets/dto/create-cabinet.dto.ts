import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CabinetVisibility } from '@prisma/client';

export class CreateCabinetDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  retentionPolicyId?: string;

  @IsOptional()
  @IsEnum(CabinetVisibility)
  visibility?: CabinetVisibility;
}
