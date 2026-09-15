import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AclPermission, Role } from '@prisma/client';

export class SetAclDto {
  @IsEnum(AclPermission)
  permission!: AclPermission;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
