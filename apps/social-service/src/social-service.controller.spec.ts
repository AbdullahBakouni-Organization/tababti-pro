import { Test, TestingModule } from '@nestjs/testing';
import { SocialServiceController } from './social-service.controller';
import { SocialServiceService } from './social-service.service';

describe('SocialServiceController', () => {
  let socialServiceController: SocialServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SocialServiceController],
      providers: [SocialServiceService],
    }).compile();

    socialServiceController = app.get<SocialServiceController>(SocialServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(socialServiceController.getHello()).toBe('Hello World!');
    });
  });
});
