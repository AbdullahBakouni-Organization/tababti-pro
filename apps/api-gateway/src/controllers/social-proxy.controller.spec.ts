import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { SocialProxyController } from './social-proxy.controller';
import { of, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('SocialProxyController', () => {
  let controller: SocialProxyController;
  let httpService: HttpService;

  const mockResponse = (): Partial<Response> => ({
    status: jest.fn().mockReturnThis() as unknown as Response['status'],
    json: jest.fn().mockReturnThis() as unknown as Response['json'],
  });

  const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
    url: '/social/feed',
    method: 'GET',
    headers: { 'content-type': 'application/json' } as any,
    body: {},
    ...overrides,
  });

  const axiosResponse = (data: unknown, status = 200): AxiosResponse => ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialProxyController],
      providers: [
        {
          provide: HttpService,
          useValue: { request: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<SocialProxyController>(SocialProxyController);
    httpService = module.get<HttpService>(HttpService);
    process.env.SOCIAL_SERVICE_URL = 'http://social-service:3003';
  });

  afterEach(() => {
    delete process.env.SOCIAL_SERVICE_URL;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should proxy a GET request to the social service', async () => {
    const responseData = { posts: [{ id: 1, text: 'Hello' }] };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse(responseData)));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://social-service:3003/feed',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(responseData);
  });

  it('should strip the /social/ prefix from the URL path', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({ url: '/social/communities/123/members' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://social-service:3003/communities/123/members',
      }),
    );
  });

  it('should pass raw request as data for multipart/form-data', async () => {
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ ok: true })));

    const req = mockRequest({
      headers: {
        'content-type': 'multipart/form-data; boundary=---abc',
      } as any,
      method: 'POST',
    });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({ data: req }),
    );
  });

  it('should pass req.body for JSON requests', async () => {
    const body = { content: 'New post', communityId: '456' };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ id: '789' })));

    const req = mockRequest({ body, method: 'POST' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({ data: body }),
    );
  });

  it('should return upstream error status on failure', async () => {
    const error = {
      message: 'Forbidden',
      response: { status: 403, data: { message: 'Access denied' } },
    };
    jest.spyOn(httpService, 'request').mockReturnValue(throwError(() => error));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Access denied' });
  });

  it('should return 500 with default message when error has no response', async () => {
    const error = { message: 'Connection timeout' };
    jest.spyOn(httpService, 'request').mockReturnValue(throwError(() => error));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Service unavailable',
      error: 'Connection timeout',
    });
  });

  it('should remove host and content-length headers before forwarding', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        host: 'gateway:3000',
        'content-length': '50',
      } as any,
    });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    const calledConfig = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(calledConfig.headers.host).toBeUndefined();
    expect(calledConfig.headers['content-length']).toBeUndefined();
  });
});
