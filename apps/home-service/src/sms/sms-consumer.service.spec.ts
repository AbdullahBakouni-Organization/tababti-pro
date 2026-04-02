import { Test, TestingModule } from '@nestjs/testing';
import { SmsConsumerController } from './sms-consumer.service';
import { SmsService } from './sms.service';

describe('SmsConsumerController', () => {
  let controller: SmsConsumerController;

  const mockSmsService = {
    send: jest.fn().mockResolvedValue(true),
  };

  const makeEvent = (
    data: Partial<{
      doctorId: string;
      phone: string;
      fullName: string;
      reason: string;
    }> = {},
  ) => ({
    eventType: 'DOCTOR_EVENT',
    timestamp: new Date(),
    data: {
      doctorId: 'doc-1',
      phone: '0911111111',
      fullName: 'Dr. Ahmad Ali',
      reason: 'Incomplete documents',
      ...data,
    },
    metadata: { source: 'home-service', version: '1.0' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SmsConsumerController],
      providers: [{ provide: SmsService, useValue: mockSmsService }],
    }).compile();

    controller = module.get<SmsConsumerController>(SmsConsumerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── handleDoctorRegistered ─────────────────────────────────────────────────

  describe('handleDoctorRegistered()', () => {
    it('sends SMS for valid doctor registration event', async () => {
      await controller.handleDoctorRegistered(makeEvent() as any);

      expect(mockSmsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: '0911111111' }),
      );
    });

    it('returns without sending when event has no data', async () => {
      await controller.handleDoctorRegistered({} as any);
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('returns without sending when phone is empty', async () => {
      await controller.handleDoctorRegistered(makeEvent({ phone: '' }) as any);
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('returns without sending when phone has fewer than 9 digits', async () => {
      await controller.handleDoctorRegistered(
        makeEvent({ phone: '12345' }) as any,
      );
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('handles errors gracefully without throwing', async () => {
      mockSmsService.send.mockRejectedValue(
        new Error('SMS service unavailable'),
      );

      await expect(
        controller.handleDoctorRegistered(makeEvent() as any),
      ).resolves.not.toThrow();
    });

    it('uses "الطبيب" as fallback when fullName is missing', async () => {
      await controller.handleDoctorRegistered(
        makeEvent({ fullName: '' }) as any,
      );

      expect(mockSmsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('الطبيب'),
        }),
      );
    });
  });

  // ── handleDoctorApproved ───────────────────────────────────────────────────

  describe('handleDoctorApproved()', () => {
    it('sends SMS for valid doctor approval event', async () => {
      await controller.handleDoctorApproved(makeEvent() as any);

      expect(mockSmsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: '0911111111' }),
      );
    });

    it('returns without sending when event has no data', async () => {
      await controller.handleDoctorApproved({} as any);
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('returns without sending when phone is too short', async () => {
      await controller.handleDoctorApproved(
        makeEvent({ phone: '91234' }) as any,
      );
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('handles errors gracefully without throwing', async () => {
      mockSmsService.send.mockRejectedValue(new Error('error'));
      await expect(
        controller.handleDoctorApproved(makeEvent() as any),
      ).resolves.not.toThrow();
    });
  });

  // ── handleDoctorRejected ───────────────────────────────────────────────────

  describe('handleDoctorRejected()', () => {
    it('sends SMS for valid doctor rejection event', async () => {
      await controller.handleDoctorRejected(makeEvent() as any);

      expect(mockSmsService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: '0911111111' }),
      );
    });

    it('includes rejection reason in message', async () => {
      await controller.handleDoctorRejected(
        makeEvent({ reason: 'Incomplete documents' }) as any,
      );

      expect(mockSmsService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Incomplete documents'),
        }),
      );
    });

    it('returns without sending when event has no data', async () => {
      await controller.handleDoctorRejected({} as any);
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('returns without sending when phone is empty after trimming', async () => {
      await controller.handleDoctorRejected(makeEvent({ phone: '   ' }) as any);
      expect(mockSmsService.send).not.toHaveBeenCalled();
    });

    it('handles errors gracefully without throwing', async () => {
      mockSmsService.send.mockRejectedValue(new Error('error'));
      await expect(
        controller.handleDoctorRejected(makeEvent() as any),
      ).resolves.not.toThrow();
    });
  });
});
