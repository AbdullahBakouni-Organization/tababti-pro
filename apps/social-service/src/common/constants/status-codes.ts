import { HttpStatus } from '@nestjs/common';

export const STATUS_CODES = {
  SUCCESS: HttpStatus.OK,
  CREATED: HttpStatus.CREATED,
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  UNPROCESSABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};
