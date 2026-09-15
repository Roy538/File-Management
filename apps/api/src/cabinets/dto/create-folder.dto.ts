import { IsOptional, IsString } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
