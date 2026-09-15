import { IsOptional, IsString } from 'class-validator';

export class UpdateCabinetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  retentionPolicyId?: string;
}
