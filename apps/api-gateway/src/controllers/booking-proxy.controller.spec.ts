import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BookingProxyController } from './booking-proxy.controller';
import { of, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('BookingProxyController', () => {
  let controller: BookingProxyController;
  let httpService: HttpService;

  const mockResponse = (): Partial<Response> => ({
    status: jest.fn().mockReturnThis() as unknown as Response['status'],
    json: jest.fn().mockReturnThis() as unknown as Response['json'],
  });

  const mockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
    url: '/booking/appointments',
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
      controllers: [BookingProxyController],
      providers: [
        {
          provide: HttpService,
          useValue: { request: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<BookingProxyController>(BookingProxyController);
    httpService = module.get<HttpService>(HttpService);
    process.env.BOOKING_SERVICE_URL = 'http://booking-service:3002';
  });

  afterEach(() => {
    delete process.env.BOOKING_SERVICE_URL;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should proxy a GET request to the booking service', async () => {
    const responseData = { bookings: [] };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse(responseData)));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://booking-service:3002/appointments',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(responseData);
  });

  it('should strip the /booking/ prefix from the URL path', async () => {
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({ url: '/booking/api/v1/slots' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://booking-service:3002/api/v1/slots',
      }),
    );
  });

  it('should pass raw request as data for multipart/form-data', async () => {
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ ok: true })));

    const req = mockRequest({
      headers: {
        'content-type': 'multipart/form-data; boundary=---xyz',
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
    const body = { date: '2026-04-01', time: '10:00' };
    jest
      .spyOn(httpService, 'request')
      .mockReturnValue(of(axiosResponse({ created: true })));

    const req = mockRequest({ body, method: 'POST' });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({ data: body }),
    );
  });

  it('should return upstream error status on failure with response', async () => {
    const error = {
      message: 'Not Found',
      response: { status: 404, data: { message: 'Booking not found' } },
    };
    jest.spyOn(httpService, 'request').mockReturnValue(throwError(() => error));

    const req = mockRequest();
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Booking not found' });
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
    jest.spyOn(httpService, 'request').mockReturnValue(of(axiosResponse({})));

    const req = mockRequest({
      headers: {
        'content-type': 'application/json',
        host: 'gateway:3000',
        'content-length': '100',
      } as any,
    });
    const res = mockResponse();

    await controller.proxy(req as Request, res as Response);

    const calledConfig = (httpService.request as jest.Mock).mock.calls[0][0];
    expect(calledConfig.headers.host).toBeUndefined();
    expect(calledConfig.headers['content-length']).toBeUndefined();
  });
});
