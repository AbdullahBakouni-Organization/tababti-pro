import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappConsumer } from './whatsapp.consumer';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappConsumer', () => {
  let consumer: WhatsappConsumer;

  const mockWhatsappService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendOtp: jest.fn().mockResolvedValue(undefined),
    sendDoctorWelcome: jest.fn().mockResolvedValue(undefined),
    sendDoctorApproved: jest.fn().mockResolvedValue(undefined),
    sendDoctorRejected: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappConsumer],
      providers: [{ provide: WhatsappService, useValue: mockWhatsappService }],
    }).compile();

    consumer = module.get<WhatsappConsumer>(WhatsappConsumer);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  // ── handleSendMessage ──────────────────────────────────────────────────────

  describe('handleSendMessage()', () => {
    it('sends message with valid payload', async () => {
      const data = { phone: '0911111111', text: 'Hello', lang: 'ar' };
      await consumer.handleSendMessage(data);
      expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
        '0911111111',
        'Hello',
        'ar',
      );
    });

    it('sends message with nested value payload', async () => {
      const data = { value: { phone: '0911111111', text: 'Hello', lang: 'en' } };
      await consumer.handleSendMessage(data);
      expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
        '0911111111',
        'Hello',
        'en',
      );
    });

    it('returns early without sending when phone is missing', async () => {
      const data = { text: 'Hello', lang: 'ar' };
      await consumer.handleSendMessage(data);
      expect(mockWhatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('returns early without sending when text is missing', async () => {
      const data = { phone: '0911111111', lang: 'ar' };
      await consumer.handleSendMessage(data);
      expect(mockWhatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('handles service errors gracefully without throwing', async () => {
      mockWhatsappService.sendMessage.mockRejectedValue(
        new Error('WhatsApp error'),
      );
      const data = { phone: '0911111111', text: 'Hello', lang: 'ar' };
      await expect(consumer.handleSendMessage(data)).resolves.toBeUndefined();
    });
  });

  // ── handleSendOtp ──────────────────────────────────────────────────────────

  describe('handleSendOtp()', () => {
    it('sends OTP with valid payload', async () => {
      const data = { phone: '0911111111', otp: '123456', lang: 'ar' };
      await consumer.handleSendOtp(data);
      expect(mockWhatsappService.sendOtp).toHaveBeenCalledWith(
        '0911111111',
        '123456',
        'ar',
      );
    });

    it('returns early without sending when phone is missing', async () => {
      const data = { otp: '123456' };
      await consumer.handleSendOtp(data);
      expect(mockWhatsappService.sendOtp).not.toHaveBeenCalled();
    });

    it('returns early without sending when otp is missing', async () => {
      const data = { phone: '0911111111' };
      await consumer.handleSendOtp(data);
      expect(mockWhatsappService.sendOtp).not.toHaveBeenCalled();
    });

    it('handles service errors gracefully without throwing', async () => {
      mockWhatsappService.sendOtp.mockRejectedValue(new Error('OTP error'));
      const data = { phone: '0911111111', otp: '123456', lang: 'ar' };
      await expect(consumer.handleSendOtp(data)).resolves.toBeUndefined();
    });
  });

  // ── handleDoctorWelcome ────────────────────────────────────────────────────

  describe('handleDoctorWelcome()', () => {
    it('sends welcome message with valid payload', async () => {
      const data = { phone: '0911111111', doctorName: 'Ahmad' };
      await consumer.handleDoctorWelcome(data);
      expect(mockWhatsappService.sendDoctorWelcome).toHaveBeenCalledWith(
        '0911111111',
        'Ahmad',
      );
    });

    it('returns early when phone is missing', async () => {
      await consumer.handleDoctorWelcome({ doctorName: 'Ahmad' });
      expect(mockWhatsappService.sendDoctorWelcome).not.toHaveBeenCalled();
    });

    it('returns early when doctorName is missing', async () => {
      await consumer.handleDoctorWelcome({ phone: '0911111111' });
      expect(mockWhatsappService.sendDoctorWelcome).not.toHaveBeenCalled();
    });

    it('handles service error gracefully', async () => {
      mockWhatsappService.sendDoctorWelcome.mockRejectedValue(
        new Error('WA error'),
      );
      await expect(
        consumer.handleDoctorWelcome({ phone: '0911111111', doctorName: 'Ahmad' }),
      ).resolves.toBeUndefined();
    });
  });

  // ── handleDoctorApproved ───────────────────────────────────────────────────

  describe('handleDoctorApproved()', () => {
    it('sends approved message with valid payload', async () => {
      const data = { phone: '0911111111', doctorName: 'Ahmad' };
      await consumer.handleDoctorApproved(data);
      expect(mockWhatsappService.sendDoctorApproved).toHaveBeenCalledWith(
        '0911111111',
        'Ahmad',
      );
    });

    it('returns early when phone is missing', async () => {
      await consumer.handleDoctorApproved({ doctorName: 'Ahmad' });
      expect(mockWhatsappService.sendDoctorApproved).not.toHaveBeenCalled();
    });

    it('handles service error gracefully', async () => {
      mockWhatsappService.sendDoctorApproved.mockRejectedValue(
        new Error('error'),
      );
      await expect(
        consumer.handleDoctorApproved({ phone: '0911111111', doctorName: 'Ahmad' }),
      ).resolves.toBeUndefined();
    });
  });

  // ── handleDoctorRejected ───────────────────────────────────────────────────

  describe('handleDoctorRejected()', () => {
    it('sends rejection message with valid payload', async () => {
      const data = { phone: '0911111111', doctorName: 'Ahmad', reason: 'Docs missing' };
      await consumer.handleDoctorRejected(data);
      expect(mockWhatsappService.sendDoctorRejected).toHaveBeenCalledWith(
        '0911111111',
        'Ahmad',
        'Docs missing',
      );
    });

    it('returns early when phone is missing', async () => {
      await consumer.handleDoctorRejected({ doctorName: 'Ahmad' });
      expect(mockWhatsappService.sendDoctorRejected).not.toHaveBeenCalled();
    });

    it('handles service error gracefully', async () => {
      mockWhatsappService.sendDoctorRejected.mockRejectedValue(
        new Error('error'),
      );
      await expect(
        consumer.handleDoctorRejected({ phone: '0911111111', doctorName: 'Ahmad' }),
      ).resolves.toBeUndefined();
    });
  });
});
