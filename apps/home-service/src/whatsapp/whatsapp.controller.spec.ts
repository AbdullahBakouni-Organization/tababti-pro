import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;

  const mockWhatsappService = {
    getQrCode: jest.fn(),
    isClientReady: jest.fn(),
    sendMessage: jest.fn(),
  };

  const mockRes = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [{ provide: WhatsappService, useValue: mockWhatsappService }],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getQr()', () => {
    it('sends connected message when no QR available', () => {
      mockWhatsappService.getQrCode.mockReturnValue(null);
      controller.getQr(mockRes as any);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('connected'),
      );
    });

    it('sends QR code page when QR is available', () => {
      mockWhatsappService.getQrCode.mockReturnValue(
        'data:image/png;base64,...',
      );
      controller.getQr(mockRes as any);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('Scan'),
      );
    });
  });

  describe('getStatus()', () => {
    it('returns ready status', () => {
      mockWhatsappService.isClientReady.mockReturnValue(true);
      const result = controller.getStatus();
      expect(result).toHaveProperty('ready');
    });
  });
});
