import { Test, TestingModule } from '@nestjs/testing';
import { MedicalEquipmentController } from './medical-equipment.controller';
import { MedicalEquipmentService } from '../services/medical.equipment.service';
import {
  UserRole,
  EntityRequestStatus,
  Machines,
} from '@app/common/database/schemas/common.enums';
import { Types } from 'mongoose';

describe('MedicalEquipmentController', () => {
  let controller: MedicalEquipmentController;

  const mockService = {
    createRequest: jest.fn(),
    getMyRequests: jest.fn(),
    getRequest: jest.fn(),
    updateRequestStatus: jest.fn(),
    deleteRequest: jest.fn(),
    getAllRequests: jest.fn(),
    getStatistics: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicalEquipmentController],
      providers: [{ provide: MedicalEquipmentService, useValue: mockService }],
    }).compile();

    controller = module.get<MedicalEquipmentController>(
      MedicalEquipmentController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createRequest()', () => {
    it('delegates to service and wraps in ApiResponse', async () => {
      const requestId = new Types.ObjectId().toString();
      mockService.createRequest.mockResolvedValue({ _id: requestId });
      const result = await controller.createRequest(
        'auth-1',
        UserRole.DOCTOR,
        'req-1',
        { equipmentType: Machines.MRIMachine, quantity: 1 } as any,
        'en',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getMyRequests()', () => {
    it('delegates to service.getMyRequests', async () => {
      mockService.getMyRequests.mockResolvedValue({ requests: [], total: 0 });
      const result = await controller.getMyRequests(
        UserRole.DOCTOR,
        'req-1',
        undefined,
        1,
        10,
        'en',
      );
      expect(mockService.getMyRequests).toHaveBeenCalled();
      expect(result).toHaveProperty('data');
    });
  });

  describe('updateRequestStatus()', () => {
    it('delegates to service.updateRequestStatus', async () => {
      mockService.updateRequestStatus.mockResolvedValue({
        _id: 'req-1',
        status: EntityRequestStatus.COMPLETED,
      });
      const result = await controller.updateRequestStatus(
        'req-1',
        { status: EntityRequestStatus.COMPLETED } as any,
        'en',
      );
      expect(result).toHaveProperty('data');
    });
  });

  describe('getStatistics()', () => {
    it('returns statistics', async () => {
      mockService.getStatistics.mockResolvedValue({ total: 10 });
      const result = await controller.getStatistics('en');
      expect(result).toHaveProperty('data');
    });
  });
});
