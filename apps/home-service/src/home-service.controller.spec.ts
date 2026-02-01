import { Test, TestingModule } from '@nestjs/testing';
import { HomeServiceController } from './home-service.controller';
import { HomeServiceService } from './home-service.service';

describe('HomeServiceController', () => {
  let homeServiceController: HomeServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HomeServiceController],
      providers: [HomeServiceService],
    }).compile();

    homeServiceController = app.get<HomeServiceController>(HomeServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(homeServiceController.getHello()).toBe('Hello World!');
    });
  });
});
