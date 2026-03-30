import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthValidateService } from '@app/common/auth-validate';

const mockAuthService = {
  requestOtp: jest
    .fn()
    .mockResolvedValue({ success: true, message: 'OTP sent' }),
  verifyOtp: jest.fn().mockResolvedValue({ success: true }),
  resendOtp: jest.fn().mockResolvedValue({ success: true }),
  completeRegistration: jest.fn().mockResolvedValue({ success: true }),
  logout: jest.fn().mockResolvedValue({ success: true }),
};

const mockAuthValidateService = {
  refreshUserAccessToken: jest.fn().mockResolvedValue({
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
  }),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: AuthValidateService, useValue: mockAuthValidateService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('requestOtp() calls authService.requestOtp and returns result', async () => {
    const dto = { phone: '+963912345678', lang: 'ar' } as any;
    const result = await controller.requestOtp(dto);
    expect(mockAuthService.requestOtp).toHaveBeenCalledWith(dto);
    expect(result.success).toBe(true);
  });

  it('verifyOtp() calls authService.verifyOtp with dto and response object', async () => {
    const dto = { phone: '+963912345678', code: '123456' } as any;
    const res = {} as any;
    await controller.verifyOtp(dto, res);
    expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(dto, res);
  });

  it('resendOtp() calls authService.resendOtp', async () => {
    const dto = { phone: '+963912345678' } as any;
    await controller.resendOtp(dto);
    expect(mockAuthService.resendOtp).toHaveBeenCalledWith(dto);
  });

  it('logout() extracts userId from req.user and calls authService.logout', async () => {
    const realId = new Types.ObjectId();
    const req = {
      user: { entity: { _id: { toString: () => realId.toString() } } },
    } as any;
    await controller.logout(req);
    expect(mockAuthService.logout).toHaveBeenCalledWith(realId.toString());
  });
});
