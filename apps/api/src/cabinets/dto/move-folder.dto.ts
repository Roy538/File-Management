import { IsOptional, IsString } from 'class-validator';

export class MoveFolderDto {
  /** Target cabinet. Omitted → keep current (or derived from parent). */
  @IsOptional()
  @IsString()
  cabinetId?: string;

  /** Target parent folder, or null to move to the cabinet root. */
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
