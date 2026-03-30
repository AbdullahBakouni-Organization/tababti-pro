import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HomeProxyController } from './home-proxy.controller';
import { of, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('HomeProxyController', () => {
  let controller: HomeProxyController;
  let httpService: HttpService;

  const mockResponse = (): Partial<Response> => {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis() as unknown as Response['status'],
      json: jest.fn().mockReturnThis() as unknown as Response['json'],
      setHeader: jest.fn().mockReturnThis() as unknown as Response['setHeader'],
    };
    return res;
  };

  const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
    url: '/home/some-path',
    method: 'GET',
    headers: { 'content-type': 'application/json' } as any,
    body: {},
    ...overrides,
  });

  const axiosResponse = (
    data: unknown,
    status = 200,
    headers: Record<string, unknown> = {},
  ): AxiosResponse => ({
    data,
    status,
    statusText: 'OK',
    headers,
    config: {} as InternalAxiosRequestConfig,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeProxyController],
      providers: [
        {
          provide: HttpService,
          useValue: {
            request: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HomeProxyController>(HomeProxyController);
    httpService = module.get<HttpService>(HttpService);
    process.env.HOME_SERVICE_URL = 'http://home-service:3001';
  });

  afterEach(() => {
    delete process.env.HOME_SERVICE_URL;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should proxy a GET request and return upstream response', async () => {
    const responseData = { items: [{ id: 1 }] };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse(responseData)));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://home-service:3001/some-path',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(responseData);
  });

  it('should strip the /home/ prefix from the URL path', async () => {
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({ url: '/home/api/v1/resource' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://home-service:3001/api/v1/resource',
      }),
    );
  });

  it('should forward Set-Cookie headers from upstream', async () => {
    const setCookie = ['session=abc123; Path=/'];
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({}, 200, { 'set-cookie': setCookie })));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', setCookie);
  });

  it('should pass raw request as data for multipart/form-data', async () => {
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ uploaded: true })));

    const req = mockRequest({
      headers: { 'content-type': 'multipart/form-data; boundary=---abc' } as any,
      method: 'POST',
    });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: req, // raw request stream
      }),
    );
  });

  it('should pass req.body for non-multipart requests', async () => {
    const body = { name: 'test' };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ success: true })));

    const req = mockRequest({ body, method: 'POST' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: body,
      }),
    );
  });

  it('should return upstream error status and data on failure', async () => {
    const error = {
      message: 'Bad Request',
      response: {
        status: 400,
        data: { message: 'Validation failed' },
      },
    };
    jest.spyOn(httpService, 'request').mockReturnValue(throwError(() => error));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Validation failed' });
  });

  it('should return 500 with default message when error has no response', async () => {
    const error = { message: 'ECONNREFUSED' };
    jest.spyOn(httpService, 'request').mockReturnValue(throwError(() => error));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Service unavailable',
      error: 'ECONNREFUSED',
    });
  });

  it('should remove host and content-length headers before forwarding', async () => {
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        host: 'gateway:3000',
        'content-length': '42',
      } as any,
    });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    const calledConfig = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(calledConfig.headers.host).toBeUndefined();
    expect(calledConfig.headers['content-length']).toBeUndefined();
  });
});
