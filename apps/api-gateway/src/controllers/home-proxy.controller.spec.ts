import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { HomeProxyController } from './home-proxy.controller';
import { ProxyService } from '../services/proxy.service';

describe('HomeProxyController', () => {
  let controller: HomeProxyController;
  let proxy: { forward: jest.Mock };

  beforeEach(async () => {
    proxy = { forward: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeProxyController],
      providers: [{ provide: ProxyService, useValue: proxy }],
    }).compile();

    controller = module.get(HomeProxyController);
    process.env.HOME_SERVICE_URL = 'http://home-service:3001';
  });

  afterEach(() => {
    delete process.env.HOME_SERVICE_URL;
  });

  it('delegates to ProxyService with the configured target and prefix', async () => {
    const req = {} as Request;
    const res = {} as Response;

    await controller.forward(req, res);

    expect(proxy.forward).toHaveBeenCalledWith(req, res, {
      target: 'http://home-service:3001',
      prefix: '/home',
    });
  });

  it('forwards an empty target when the env var is unset (ProxyService handles it)', async () => {
    delete process.env.HOME_SERVICE_URL;
    const req = {} as Request;
    const res = {} as Response;

    await controller.forward(req, res);

    expect(proxy.forward).toHaveBeenCalledWith(req, res, {
      target: '',
      prefix: '/home',
    });
  });
});
