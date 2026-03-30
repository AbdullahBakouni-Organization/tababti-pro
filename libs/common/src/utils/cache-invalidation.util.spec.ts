import {
  invalidateBookingCaches,
  invalidateProfileDoctorPostCaches,
  invalidateProfileDoctorGalleryCaches,
  invalidateMainProfileCaches,
  invalidateQuestionsCaches,
} from './cache-invalidation.util';
import { Logger } from '@nestjs/common';

describe('cache-invalidation.util', () => {
  let cacheService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    reset: jest.Mock;
    keys: jest.Mock;
    invalidatePattern: jest.Mock;
  };
  let logger: Logger;

  beforeEach(() => {
    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      keys: jest.fn(),
      invalidatePattern: jest.fn().mockResolvedValue(undefined),
    };
    logger = { warn: jest.fn() } as unknown as Logger;
  });

  describe('invalidateBookingCaches', () => {
    it('should invalidate doctor-related patterns', async () => {
      await invalidateBookingCaches(cacheService as any, 'doc123');

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctor:bookings:doc123:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'slots:available:doc123:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctor:doc123:working-hours',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctor_mobile_profile:doc123',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledTimes(4);
    });

    it('should invalidate patient patterns for a single patientId', async () => {
      await invalidateBookingCaches(cacheService as any, 'doc1', 'pat1');

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'user_bookings:pat1:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'booking:next-user:pat1:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'patient:bookings:pat1:*',
      );
      // 4 doctor + 3 patient = 7
      expect(cacheService.invalidatePattern).toHaveBeenCalledTimes(7);
    });

    it('should invalidate patient patterns for an array of patientIds', async () => {
      await invalidateBookingCaches(cacheService as any, 'doc1', [
        'pat1',
        'pat2',
      ]);

      // 4 doctor + 3*2 patient = 10
      expect(cacheService.invalidatePattern).toHaveBeenCalledTimes(10);
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'user_bookings:pat2:*',
      );
    });

    it('should catch errors and log a warning', async () => {
      cacheService.invalidatePattern.mockRejectedValue(
        new Error('Redis down'),
      );

      await expect(
        invalidateBookingCaches(cacheService as any, 'doc1', undefined, logger),
      ).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis down'),
      );
    });

    it('should not throw when no logger is provided and error occurs', async () => {
      cacheService.invalidatePattern.mockRejectedValue(new Error('fail'));

      await expect(
        invalidateBookingCaches(cacheService as any, 'doc1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('invalidateProfileDoctorPostCaches', () => {
    it('should invalidate post-related patterns', async () => {
      await invalidateProfileDoctorPostCaches(cacheService as any, 'doc1');

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctor:posts:doc1:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctors:posts:doc1:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'approved_posts:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledTimes(3);
    });

    it('should catch errors and log a warning', async () => {
      cacheService.invalidatePattern.mockRejectedValue(new Error('err'));

      await invalidateProfileDoctorPostCaches(
        cacheService as any,
        'doc1',
        logger,
      );

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('invalidateProfileDoctorGalleryCaches', () => {
    it('should invalidate gallery-related patterns', async () => {
      await invalidateProfileDoctorGalleryCaches(cacheService as any, 'doc1');

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctor:gallery:doc1:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctor_mobile_profile:doc1:gallery:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctors:gallery:doc1:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledTimes(3);
    });

    it('should catch errors and log a warning', async () => {
      cacheService.invalidatePattern.mockRejectedValue(new Error('err'));

      await invalidateProfileDoctorGalleryCaches(
        cacheService as any,
        'doc1',
        logger,
      );

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('invalidateMainProfileCaches', () => {
    it('should invalidate profile-related patterns', async () => {
      await invalidateMainProfileCaches(cacheService as any, 'auth1');

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctor:profile:auth1',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'doctors:profile:auth1:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledTimes(2);
    });

    it('should catch errors and log a warning', async () => {
      cacheService.invalidatePattern.mockRejectedValue(new Error('err'));

      await invalidateMainProfileCaches(cacheService as any, 'auth1', logger);

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('invalidateQuestionsCaches', () => {
    it('should invalidate questions pattern', async () => {
      await invalidateQuestionsCaches(cacheService as any);

      expect(cacheService.invalidatePattern).toHaveBeenCalledWith(
        'questions:*',
      );
      expect(cacheService.invalidatePattern).toHaveBeenCalledTimes(1);
    });

    it('should catch errors and log a warning', async () => {
      cacheService.invalidatePattern.mockRejectedValue(new Error('err'));

      await invalidateQuestionsCaches(cacheService as any, logger);

      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
