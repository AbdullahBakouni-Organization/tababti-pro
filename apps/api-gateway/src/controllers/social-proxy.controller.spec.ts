import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { SocialProxyController } from './social-proxy.controller';
import { ProxyService } from '../services/proxy.service';

describe('SocialProxyController', () => {
  let controller: SocialProxyController;
  let proxy: { forward: jest.Mock };

  beforeEach(async () => {
    proxy = { forward: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialProxyController],
      providers: [{ provide: ProxyService, useValue: proxy }],
    }).compile();

    controller = module.get(SocialProxyController);
    process.env.SOCIAL_SERVICE_URL = 'http://social-service:3002';
  });

  afterEach(() => {
    delete process.env.SOCIAL_SERVICE_URL;
  });

  it('delegates to ProxyService with the configured target and prefix', async () => {
    const req = { url: '/social/profile' } as Request;
    const res = {} as Response;

    await controller.forward(req, res);

    expect(proxy.forward).toHaveBeenCalledWith(req, res, {
      target: 'http://social-service:3002',
      prefix: '/social',
      timeoutMs: undefined,
    });
  });

  it('extends the proxy timeout for /social/nearby (slow ORS upstream)', async () => {
    const req = { url: '/social/nearby?lat=33.5&lng=36.3' } as Request;
    const res = {} as Response;

    await controller.forward(req, res);

    expect(proxy.forward).toHaveBeenCalledWith(req, res, {
      target: 'http://social-service:3002',
      prefix: '/social',
      timeoutMs: 30_000,
    });
  });
});
