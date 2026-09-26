import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SaveBpmnWorkflowDto {
  @ApiProperty({ description: "The visual editor's own saved BPMN XML." })
  @IsString()
  @IsNotEmpty()
  diagramXml!: string;
}
