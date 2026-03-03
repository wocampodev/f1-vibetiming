import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { SeasonPaginationQueryDto } from './season-pagination-query.dto';

export class StandingsQueryDto extends SeasonPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  round?: number;
}
