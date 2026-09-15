import { IsString } from 'class-validator';

export class CreateSubDividerDto {
  @IsString()
  name!: string;
}
