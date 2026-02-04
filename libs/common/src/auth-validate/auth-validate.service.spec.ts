import { Test, TestingModule } from '@nestjs/testing';
import { AuthValidateService } from './auth-validate.service';

describe('AuthValidateService', () => {
  let service: AuthValidateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthValidateService],
    }).compile();

    service = module.get<AuthValidateService>(AuthValidateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
