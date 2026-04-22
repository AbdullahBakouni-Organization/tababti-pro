jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    getNumberId: jest
      .fn()
      .mockResolvedValue({ _serialized: '9639111111111@c.us' }),
  })),
  LocalAuth: jest.fn().mockImplementation(() => ({})),
  Message: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,...'),
}));
jest.mock('qrcode-terminal', () => ({ generate: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappService],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getQrCode()', () => {
    it('returns null before QR is generated', () => {
      const qr = service.getQrCode();
      expect(qr).toBeNull();
    });
  });

  describe('isClientReady()', () => {
    it('returns false before initialization', () => {
      expect(service.isClientReady()).toBe(false);
    });
  });

  describe('sendMessage()', () => {
    it('queues message when client is not ready', async () => {
      // Should not throw
      await expect(
        service.sendMessage('0911111111', 'Hello'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendBookingCancelledToDoctor()', () => {
    it('forwards an Arabic cancellation message containing patient and doctor info', async () => {
      const sendSpy = jest
        .spyOn(service, 'sendMessage')
        .mockResolvedValue(undefined);

      await service.sendBookingCancelledToDoctor(
        '0911111111',
        'Ahmad',
        'Ali',
        '2026-04-22',
        '10:00',
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const [phoneArg, textArg, langArg] = sendSpy.mock.calls[0];
      expect(phoneArg).toBe('0911111111');
      expect(langArg).toBe('ar');
      expect(textArg).toContain('إلغاء حجز');
      expect(textArg).toContain('Ahmad');
      expect(textArg).toContain('Ali');
      expect(textArg).toContain('2026-04-22');
      expect(textArg).toContain('10:00');
    });
  });
});
