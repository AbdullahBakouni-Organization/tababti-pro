import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { NotificationProxyController } from './notification-proxy.controller';
import { of, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('NotificationProxyController', () => {
  let controller: NotificationProxyController;
  let httpService: HttpService;

  const mockResponse = (): Partial<Response> => ({
    status: jest.fn().mockReturnThis() as unknown as Response['status'],
    json: jest.fn().mockReturnThis() as unknown as Response['json'],
  });

  const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
    url: '/notification/send',
    method: 'POST',
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
      controllers: [NotificationProxyController],
      providers: [
        {
          provide: HttpService,
          useValue: { request: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<NotificationProxyController>(
      NotificationProxyController,
    );
    httpService = module.get<HttpService>(HttpService);
    process.env.NOTIFICATION_SERVICE_URL = 'http://notification-service:3004';
  });

  afterEach(() => {
    delete process.env.NOTIFICATION_SERVICE_URL;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should proxy a POST request to the notification service', async () => {
    const responseData = { sent: true };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse(responseData)));

    const req = mockRequest({ body: { userId: '123', message: 'Hello' } });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://notification-service:3004/send',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(responseData);
  });

  it('should strip the /notification/ prefix from the URL path', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({ url: '/notification/push/subscribe' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://notification-service:3004/push/subscribe',
      }),
    );
  });

  it('should pass raw request as data for multipart/form-data', async () => {
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ ok: true })));

    const req = mockRequest({
      headers: {
        'content-type': 'multipart/form-data; boundary=---def',
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
    const body = { token: 'fcm-token', topic: 'news' };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ subscribed: true })));

    const req = mockRequest({ body, method: 'POST' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({ data: body }),
    );
  });

  it('should return upstream error status on failure', async () => {
    const error = {
      message: 'Unprocessable',
      response: { status: 422, data: { message: 'Invalid token' } },
    };
    jest.spyOn(httpService, 'request').mockReturnValue(throwError(() => error));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
  });

  it('should return 500 with default message when error has no response', async () => {
    const error = { message: 'ETIMEDOUT' };
    jest.spyOn(httpService, 'request').mockReturnValue(throwError(() => error));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Service unavailable',
      error: 'ETIMEDOUT',
    });
  });

  it('should remove host and content-length headers before forwarding', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        host: 'gateway:3000',
        'content-length': '75',
      } as any,
    });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    const calledConfig = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(calledConfig.headers.host).toBeUndefined();
    expect(calledConfig.headers['content-length']).toBeUndefined();
  });
});
