import { IsOptional, IsString } from 'class-validator';

export class CreateDocumentTypeDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
