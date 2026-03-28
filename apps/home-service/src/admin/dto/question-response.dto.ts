// dto/question-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class QuestionDto {
  @ApiProperty() questionId: string;
  @ApiProperty() userId: string;
  @ApiProperty() content: string;
  @ApiProperty() images: string[];
  @ApiProperty() specializationIds: string[];
  @ApiProperty() approvalStatus: string;
  @ApiProperty() hasText: boolean;
  @ApiProperty() hasImages: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() rejectionReason?: string;
}

export class PaginatedQuestionsResponseDto {
  @ApiProperty({ type: [QuestionDto] })
  questions: { data: QuestionDto[] };

  @ApiProperty()
  meta: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
