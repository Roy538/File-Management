import { IsIn, IsOptional, IsString } from 'class-validator';

export class WorkflowActionDto {
  @IsIn(['APPROVE', 'REJECT', 'CANCEL'])
  action!: 'APPROVE' | 'REJECT' | 'CANCEL';

  @IsOptional()
  @IsString()
  comment?: string;
}
