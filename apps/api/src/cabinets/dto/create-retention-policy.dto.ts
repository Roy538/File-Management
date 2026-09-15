import { IsEnum, IsInt, IsString, Min } from 'class-validator';
import { RetentionAction } from '@prisma/client';

export class CreateRetentionPolicyDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  retentionDays!: number;

  @IsEnum(RetentionAction)
  action!: RetentionAction;
}
