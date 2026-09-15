import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class WorkflowStepDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsIn(['ADMIN', 'OFFICER'])
  assigneeRole!: 'ADMIN' | 'OFFICER';

  @IsInt()
  @Min(1)
  order!: number;
}

export class CreateWorkflowDefinitionDto {
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}
