import { IsString } from 'class-validator';

export class MoveSubDividerDto {
  /** Target folder to move this sub-divider into. */
  @IsString()
  folderId!: string;
}
