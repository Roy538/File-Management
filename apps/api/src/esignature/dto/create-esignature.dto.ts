import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SignerDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

export class CreateESignatureDto {
  @IsString()
  documentId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignerDto)
  signers!: SignerDto[];

  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
