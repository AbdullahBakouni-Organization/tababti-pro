import { Injectable } from '@nestjs/common';
import { escapeRegex } from '@app/common/utils/escape-regex.util';

export type MongoCondition = Record<string, any>;

@Injectable()
export class BaseConditionBuilder {
  textSearch(fields: string[], terms: string[]): MongoCondition {
    return {
      $or: terms.flatMap((term) =>
        fields.map((field) => ({
          [field]: { $regex: escapeRegex(term), $options: 'i' },
        })),
      ),
    };
  }

  exact(field: string, value: unknown): MongoCondition | null {
    if (value === undefined || value === null) return null;
    return { [field]: value };
  }

  in(field: string, values?: unknown[]): MongoCondition | null {
    if (!values || values.length === 0) return null;
    return { [field]: { $in: values } };
  }

  range(field: string, min?: number, max?: number): MongoCondition | null {
    if (min === undefined && max === undefined) return null;
    return {
      [field]: {
        ...(min !== undefined ? { $gte: min } : {}),
        ...(max !== undefined ? { $lte: max } : {}),
      },
    };
  }

  min(field: string, value?: number): MongoCondition | null {
    if (value === undefined) return null;
    return { [field]: { $gte: value } };
  }

  combine(conditions: MongoCondition[]): MongoCondition {
    return conditions.length ? { $and: conditions } : {};
  }
}
