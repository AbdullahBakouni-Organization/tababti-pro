import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { BookingProxyController } from './booking-proxy.controller';
import { ProxyService } from '../services/proxy.service';

describe('BookingProxyController', () => {
  let controller: BookingProxyController;
  let proxy: { forward: jest.Mock };

  beforeEach(async () => {
    proxy = { forward: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingProxyController],
      providers: [{ provide: ProxyService, useValue: proxy }],
    }).compile();

    controller = module.get(BookingProxyController);
    process.env.BOOKING_SERVICE_URL = 'http://booking-service:3003';
  });

  afterEach(() => {
    delete process.env.BOOKING_SERVICE_URL;
  });

  it('delegates to ProxyService with the configured target and prefix', async () => {
    const req = {} as Request;
    const res = {} as Response;

    await controller.forward(req, res);

    expect(proxy.forward).toHaveBeenCalledWith(req, res, {
      target: 'http://booking-service:3003',
      prefix: '/booking',
    });
  });
});
