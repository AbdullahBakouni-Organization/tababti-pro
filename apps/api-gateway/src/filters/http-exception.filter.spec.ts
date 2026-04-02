import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';
import type { Request, Response } from 'express';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  const mockResponse = (): Partial<Response> => ({
    status: jest.fn().mockReturnThis() as unknown as Response['status'],
    json: jest.fn().mockReturnThis() as unknown as Response['json'],
  });

  const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
    method: 'GET',
    url: '/test/path',
    ...overrides,
  });

  const createMockHost = (
    req: Partial<Request>,
    res: Partial<Response>,
  ): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle HttpException and return proper status and message', () => {
    const req = mockRequest();
    const res = mockResponse();
    const host = createMockHost(req, res);
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Not Found',
        path: '/test/path',
      }),
    );
  });

  it('should handle HttpException with object response containing message array', () => {
    const req = mockRequest();
    const res = mockResponse();
    const host = createMockHost(req, res);
    const exception = new HttpException(
      {
        message: ['field1 is required', 'field2 must be a string'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['field1 is required', 'field2 must be a string'],
      }),
    );
  });

  it('should return 500 for non-HttpException errors', () => {
    const req = mockRequest();
    const res = mockResponse();
    const host = createMockHost(req, res);
    const exception = new Error('Database connection failed');

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
  });

  it('should return 500 for non-Error exceptions (e.g. thrown strings)', () => {
    const req = mockRequest();
    const res = mockResponse();
    const host = createMockHost(req, res);

    filter.catch('something went wrong', host);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
  });

  it('should include requestId and timestamp in the response', () => {
    const req = mockRequest();
    const res = mockResponse();
    const host = createMockHost(req, res);

    filter.catch(new Error('test'), host);

    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.requestId).toBeDefined();
    expect(typeof jsonCall.requestId).toBe('string');
    expect(jsonCall.timestamp).toBeDefined();
    expect(new Date(jsonCall.timestamp).getTime()).not.toBeNaN();
  });

  it('should include path from request URL in the response', () => {
    const req = mockRequest({ url: '/api/v1/users/123' });
    const res = mockResponse();
    const host = createMockHost(req, res);

    filter.catch(new HttpException('Forbidden', HttpStatus.FORBIDDEN), host);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        path: '/api/v1/users/123',
      }),
    );
  });
});
