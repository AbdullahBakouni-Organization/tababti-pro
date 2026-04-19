import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Request, Response } from 'express';
import { of, throwError } from 'rxjs';
import { ProxyService } from './proxy.service';

describe('ProxyService', () => {
  let service: ProxyService;
  let httpService: HttpService;

  const axiosResponse = (
    data: unknown,
    status = 200,
    headers: Record<string, string | string[]> = {},
  ): AxiosResponse => ({
    data: Buffer.from(
      typeof data === 'string' ? data : JSON.stringify(data),
      'utf8',
    ),
    status,
    statusText: 'OK',
    headers: headers as any,
    config: {} as InternalAxiosRequestConfig,
  });

  const mockResponse = (): Partial<Response> & {
    _headers: Record<string, unknown>;
    _body?: unknown;
    _status?: number;
  } => {
    const res: any = { _headers: {} };
    res.status = jest.fn((code: number) => {
      res._status = code;
      return res;
    });
    res.json = jest.fn((body: unknown) => {
      res._body = body;
      return res;
    });
    res.send = jest.fn((body: unknown) => {
      res._body = body;
      return res;
    });
    res.setHeader = jest.fn((name: string, value: unknown) => {
      res._headers[name] = value;
      return res;
    });
    return res;
  };

  const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> =>
    ({
      url: '/home/some-path',
      method: 'GET',
      headers: { 'content-type': 'application/json' } as any,
      body: {},
      ip: '10.0.0.1',
      protocol: 'http',
      hostname: 'api.tababti.test',
      ...overrides,
    }) as unknown as Partial<Request>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        {
          provide: HttpService,
          useValue: { request: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ProxyService);
    httpService = module.get(HttpService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('returns 500 when the target URL is empty', async () => {
    const res = mockResponse();
    await service.forward(mockRequest() as Request, res as Response, {
      target: '',
      prefix: '/home',
    });
    expect(res._status).toBe(500);
  });

  it('strips the prefix from req.url when building the upstream URL', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));

    const res = mockResponse();
    await service.forward(
      mockRequest({ url: '/home/api/v1/resource' }) as Request,
      res as Response,
      { target: 'http://home-service:3001', prefix: '/home' },
    );

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://home-service:3001/api/v1/resource',
      }),
    );
  });

  it('forwards only allowlisted request headers', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));
    const res = mockResponse();

    await service.forward(
      mockRequest({
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer abc',
          host: 'gateway:3000',
          'x-admin-override': 'true',
          'x-internal-user': 'root',
        } as any,
      }) as Request,
      res as Response,
      { target: 'http://x', prefix: '/home' },
    );

    const cfg = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(cfg.headers['authorization']).toBe('Bearer abc');
    expect(cfg.headers['content-type']).toBe('application/json');
    expect(cfg.headers['host']).toBeUndefined();
    expect(cfg.headers['x-admin-override']).toBeUndefined();
    expect(cfg.headers['x-internal-user']).toBeUndefined();
  });

  it('re-writes trust-boundary headers from the request context', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));
    const res = mockResponse();

    await service.forward(
      mockRequest({
        headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } as any,
      }) as Request,
      res as Response,
      { target: 'http://x', prefix: '/home' },
    );

    const cfg = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(cfg.headers['x-real-ip']).toBe('1.2.3.4');
    expect(cfg.headers['x-forwarded-proto']).toBe('http');
    expect(cfg.headers['x-forwarded-host']).toBe('api.tababti.test');
  });

  it('streams the raw request body on multipart uploads', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));
    const res = mockResponse();

    const req = mockRequest({
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=---abc',
      } as any,
    }) as Request;

    await service.forward(req, res as Response, {
      target: 'http://x',
      prefix: '/home',
    });

    const cfg = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(cfg.data).toBe(req);
  });

  it('passes req.body for non-multipart requests', async () => {
    const body = { name: 'test' };
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));
    const res = mockResponse();

    await service.forward(
      mockRequest({ method: 'POST', body }) as Request,
      res as Response,
      { target: 'http://x', prefix: '/home' },
    );

    const cfg = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(cfg.data).toBe(body);
  });

  it('propagates Set-Cookie from the upstream response', async () => {
    const setCookie = ['session=abc; Path=/'];
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({}, 200, { 'set-cookie': setCookie })));

    const res = mockResponse();
    await service.forward(mockRequest() as Request, res as Response, {
      target: 'http://x',
      prefix: '/home',
    });

    expect(res._headers['set-cookie']).toEqual(setCookie);
  });

  it('strips hop-by-hop response headers before forwarding', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(
      of(
        axiosResponse({}, 200, {
          'content-type': 'application/json',
          'content-length': '42',
          'content-encoding': 'gzip',
          connection: 'keep-alive',
        }),
      ),
    );

    const res = mockResponse();
    await service.forward(mockRequest() as Request, res as Response, {
      target: 'http://x',
      prefix: '/home',
    });

    expect(res._headers['content-type']).toBe('application/json');
    expect(res._headers['content-length']).toBeUndefined();
    expect(res._headers['content-encoding']).toBeUndefined();
    expect(res._headers['connection']).toBeUndefined();
  });

  it('maps upstream errors to their status + body', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(
      throwError(() => ({
        message: 'Bad',
        response: { status: 400, data: { message: 'Validation failed' } },
      })),
    );

    const res = mockResponse();
    await service.forward(mockRequest() as Request, res as Response, {
      target: 'http://x',
      prefix: '/home',
    });

    expect(res._status).toBe(400);
    expect(res._body).toEqual({ message: 'Validation failed' });
  });

  it('returns 502 with a generic message on transport failures', async () => {
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(throwError(() => ({ message: 'ECONNREFUSED' })));

    const res = mockResponse();
    await service.forward(mockRequest() as Request, res as Response, {
      target: 'http://x',
      prefix: '/home',
    });

    expect(res._status).toBe(502);
    expect(res._body).toEqual({
      message: 'Service unavailable',
      error: 'ECONNREFUSED',
    });
  });
});
