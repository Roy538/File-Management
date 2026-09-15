import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CabinetVisibility } from '@prisma/client';

export class CreateFromTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  templateKey!: string;

  @IsOptional()
  @IsEnum(CabinetVisibility)
  visibility?: CabinetVisibility;
}
