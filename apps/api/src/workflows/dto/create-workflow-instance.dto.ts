import { IsOptional, IsString } from 'class-validator';

export class CreateWorkflowInstanceDto {
  @IsString()
  documentId!: string;

  @IsString()
  workflowDefinitionId!: string;
}

export class ListWorkflowInstancesDto {
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
