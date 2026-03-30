import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParseMongoIdPipe } from './parse-mongo-id.pipe';

describe('ParseMongoIdPipe', () => {
  let pipe: ParseMongoIdPipe;

  beforeEach(() => {
    pipe = new ParseMongoIdPipe();
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  describe('transform', () => {
    it('should return the value when given a valid ObjectId string', () => {
      const validId = new Types.ObjectId().toHexString();
      const result = pipe.transform(validId);
      expect(result).toBe(validId);
    });

    it('should return the value for another valid ObjectId', () => {
      const validId = '507f1f77bcf86cd799439011';
      const result = pipe.transform(validId);
      expect(result).toBe(validId);
    });

    it('should throw BadRequestException for an invalid ObjectId', () => {
      expect(() => pipe.transform('invalid-id')).toThrow(BadRequestException);
    });

    it('should include the invalid value in the error message', () => {
      const invalidValue = 'not-a-mongo-id';
      expect(() => pipe.transform(invalidValue)).toThrow(
        `Invalid MongoDB ObjectId: ${invalidValue}`,
      );
    });

    it('should throw BadRequestException for an empty string', () => {
      expect(() => pipe.transform('')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for a short hex string', () => {
      expect(() => pipe.transform('507f1f77')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for a string with invalid characters', () => {
      expect(() => pipe.transform('507f1f77bcf86cd79943901z')).toThrow(
        BadRequestException,
      );
    });

    it('should accept a valid 24-character hex string', () => {
      const hexId = 'aabbccddeeff00112233aabb';
      const result = pipe.transform(hexId);
      expect(result).toBe(hexId);
    });
  });
});
