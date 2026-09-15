import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateReturnDto {
  @ApiProperty({ required: false, description: 'Name of the person handing back the file' })
  @IsOptional()
  @IsString()
  returnedBy?: string;

  @ApiProperty({ required: false, enum: ['Good', 'Fair', 'Poor'] })
  @IsOptional()
  @IsIn(['Good', 'Fair', 'Poor'])
  condition?: string;

  @ApiProperty({ required: false, description: 'Whether the file was returned to its correct location' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  returnedToCorrectLocation?: boolean;

  @ApiProperty({ required: false, description: 'Actual location if returned to wrong location' })
  @IsOptional()
  @IsString()
  actualLocation?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'Filing location to restore the file to after return' })
  @IsOptional()
  @IsString()
  returnLocation?: string;
}
