import { Injectable } from '@nestjs/common';
import { SearchFilterDto } from '../dto/search-filter.dto';
import { BaseConditionBuilder, MongoCondition } from './base-condition.builder';

@Injectable()
export class CenterConditionBuilder {
  constructor(private readonly base: BaseConditionBuilder) {}

  build(dto: SearchFilterDto, variants: string[]): MongoCondition {
    const conditions: MongoCondition[] = [];

    const terms =
      variants.length > 0 ? variants : dto.centerName ? [dto.centerName] : [];
    if (terms.length) {
      conditions.push(this.base.textSearch(['name', 'bio'], terms));
    }

    // Location & specialization
    [
      this.base.exact('cityId', dto.centerCity),
      this.base.exact('subcity', dto.subcity),
      this.base.exact('centerSpecialization', dto.centerSpecialization),
      this.base.range('rating', dto.minRating, dto.minRating),
    ].forEach((c) => c && conditions.push(c));

    // Capabilities
    [
      this.base.in('departments', dto.departments),
      this.base.in('operations', dto.operations),
      this.base.in('machines', dto.machines),
    ].forEach((c) => c && conditions.push(c));

    return this.base.combine(conditions);
  }
}
