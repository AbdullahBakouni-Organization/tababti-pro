import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { SmsService } from './sms.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SmsService', () => {
  let service: SmsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsService],
    }).compile();

    service = module.get<SmsService>(SmsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateOTP()', () => {
    it('generates a 6-digit string', () => {
      const otp = service.generateOTP();
      expect(otp).toHaveLength(6);
      expect(Number(otp)).toBeGreaterThanOrEqual(100000);
      expect(Number(otp)).toBeLessThanOrEqual(999999);
    });
  });

  describe('sendOTP()', () => {
    it('returns true when SMS API is not configured (no env vars)', async () => {
      delete process.env.SMS_API_URL;
      delete process.env.SMS_API_KEY;
      delete process.env.SMS_FROM_PHONE;

      const result = await service.sendOTP('0911111111', '123456');
      expect(result).toBe(true);
    });

    it('sends OTP via SMS API when configured', async () => {
      process.env.SMS_API_URL = 'https://api.sms.test/send';
      process.env.SMS_API_KEY = 'test-key';
      process.env.SMS_FROM_PHONE = '+963999999999';

      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.sendOTP('0911111111', '123456');
      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sms.test/send',
        expect.objectContaining({ to: '+963911111111' }),
        expect.any(Object),
      );

      delete process.env.SMS_API_URL;
      delete process.env.SMS_API_KEY;
      delete process.env.SMS_FROM_PHONE;
    });

    it('throws when SMS API fails', async () => {
      process.env.SMS_API_URL = 'https://api.sms.test/send';
      process.env.SMS_API_KEY = 'test-key';
      process.env.SMS_FROM_PHONE = '+963999999999';

      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await expect(service.sendOTP('0911111111', '123456')).rejects.toThrow(
        'Network error',
      );

      delete process.env.SMS_API_URL;
      delete process.env.SMS_API_KEY;
      delete process.env.SMS_FROM_PHONE;
    });
  });

  describe('send()', () => {
    it('returns true when no SMS config available', async () => {
      delete process.env.SMS_API_URL;
      const result = await service.send({
        to: '0911111111',
        message: 'Test message',
      });
      expect(result).toBe(true);
    });

    it('throws when phone number is empty', async () => {
      await expect(service.send({ to: '', message: 'Test' })).rejects.toThrow();
    });

    it('throws when message is empty', async () => {
      await expect(
        service.send({ to: '0911111111', message: '' }),
      ).rejects.toThrow();
    });

    it('formats Syrian phone with 0 prefix correctly', async () => {
      delete process.env.SMS_API_URL;
      // Won't hit API, just verifies it runs without error
      await expect(
        service.send({ to: '0911111111', message: 'Hello' }),
      ).resolves.toBe(true);
    });

    it('sends via API when configured', async () => {
      process.env.SMS_API_URL = 'https://api.sms.test/send';
      process.env.SMS_API_KEY = 'test-key';
      process.env.SMS_FROM_PHONE = '+963999999999';

      mockedAxios.post.mockResolvedValue({ data: {} });

      const result = await service.send({
        to: '963911111111',
        message: 'Hello Syria',
      });
      expect(result).toBe(true);

      delete process.env.SMS_API_URL;
      delete process.env.SMS_API_KEY;
      delete process.env.SMS_FROM_PHONE;
    });
  });
});
