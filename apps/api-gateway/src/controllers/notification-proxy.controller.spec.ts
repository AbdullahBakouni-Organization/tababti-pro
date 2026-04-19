import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { NotificationProxyController } from './notification-proxy.controller';
import { ProxyService } from '../services/proxy.service';

describe('NotificationProxyController', () => {
  let controller: NotificationProxyController;
  let proxy: { forward: jest.Mock };

  beforeEach(async () => {
    proxy = { forward: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationProxyController],
      providers: [{ provide: ProxyService, useValue: proxy }],
    }).compile();

    controller = module.get(NotificationProxyController);
    process.env.NOTIFICATION_SERVICE_URL = 'http://notification-service:3006';
  });

  afterEach(() => {
    delete process.env.NOTIFICATION_SERVICE_URL;
  });

  it('delegates to ProxyService with the configured target and prefix', async () => {
    const req = {} as Request;
    const res = {} as Response;

    await controller.forward(req, res);

    expect(proxy.forward).toHaveBeenCalledWith(req, res, {
      target: 'http://notification-service:3006',
      prefix: '/notification',
    });
  });
});
