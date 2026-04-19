import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from '../service/dashboard.service.rest';

describe('DashboardController', () => {
  let controller: DashboardController;

  const mockDashboardService = {
    getDoctorDashboard: jest.fn(),
    getStats: jest.fn(),
    getRecentPatients: jest.fn(),
    getCalendar: jest.fn(),
    getAppointments: jest.fn(),
    getGenderStats: jest.fn(),
    getLocationChart: jest.fn(),
    resolveDoctor: jest.fn(),
    getCacheInfo: jest.fn(),
    getDoctorDashboardById: jest.fn(),
    cronRefreshRecentPatients: jest.fn(),
    cronRefreshLocationChart: jest.fn(),
    getDoctorStats: jest.fn(),
    getMonthlyIncome: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDoctorDashboard()', () => {
    it('delegates to service and wraps in ApiResponse', async () => {
      mockDashboardService.getDoctorDashboard.mockResolvedValue({ stats: {} });
      const result = await controller.getDoctorDashboard(
        'auth-1',
        {} as any,
        'en',
      );
      expect(mockDashboardService.getDoctorDashboard).toHaveBeenCalledWith(
        'auth-1',
        {},
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getStats()', () => {
    it('delegates to service.getStats', async () => {
      mockDashboardService.getStats.mockResolvedValue({ total: 5 });
      const result = await controller.getStats('auth-1', {} as any, 'en');
      expect(mockDashboardService.getStats).toHaveBeenCalledWith('auth-1', {});
      expect(result).toHaveProperty('data');
    });
  });

  describe('getRecentPatients()', () => {
    it('delegates to service.getRecentPatients', async () => {
      mockDashboardService.getRecentPatients.mockResolvedValue([]);
      const result = await controller.getRecentPatients('auth-1', 'en');
      expect(mockDashboardService.getRecentPatients).toHaveBeenCalledWith(
        'auth-1',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getCalendar()', () => {
    it('delegates to service.getCalendar', async () => {
      mockDashboardService.getCalendar.mockResolvedValue({ months: [] });
      const result = await controller.getCalendar(
        'auth-1',
        { year: 2026, month: 3 } as any,
        'en',
      );
      expect(mockDashboardService.getCalendar).toHaveBeenCalled();
      expect(result).toHaveProperty('data');
    });
  });

  describe('getAppointments()', () => {
    it('delegates to service.getAppointments', async () => {
      mockDashboardService.getAppointments.mockResolvedValue({ data: [] });
      const result = await controller.getAppointments(
        'auth-1',
        {} as any,
        'en',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getGenderStats()', () => {
    it('delegates to service.getGenderStats', async () => {
      mockDashboardService.getGenderStats.mockResolvedValue({ male: 5 });
      const result = await controller.getGenderStats('auth-1', {} as any, 'en');
      expect(result).toHaveProperty('data');
    });
  });

  describe('getMonthlyIncome()', () => {
    it('delegates to service.getMonthlyIncome and wraps in ApiResponse', async () => {
      const payload = {
        currency: 'USD',
        months: [],
        peak: { key: 'Jan', value: 0 },
      };
      mockDashboardService.getMonthlyIncome.mockResolvedValue(payload);

      const result = await controller.getMonthlyIncome(
        'auth-1',
        { months: 3 } as any,
        'en',
      );

      expect(mockDashboardService.getMonthlyIncome).toHaveBeenCalledWith(
        'auth-1',
        { months: 3 },
      );
      expect(result).toMatchObject({ success: true, data: payload });
    });
  });

  describe('getDoctorStats()', () => {
    it('returns doctor community stats', async () => {
      const stats = { bookings: 10, questions: 5, posts: 3 };
      mockDashboardService.getDoctorStats.mockResolvedValue(stats);
      const result = await controller.getDoctorStats('doc-1');
      expect(result).toEqual(stats);
    });
  });
});
