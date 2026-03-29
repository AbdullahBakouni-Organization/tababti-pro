import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { WorkingHoursController } from './working-hours.controller';
import { WorkingHoursService } from './working-hours.service';

const realDoctorId = new Types.ObjectId();
const makeReq = () => ({
  user: { entity: { _id: { toString: () => realDoctorId.toString() } } },
});

const mockWorkingHoursService = {
  addWorkingHours: jest.fn().mockResolvedValue({ message: 'Added', doctorId: realDoctorId.toString(), workingHours: [] }),
  getWorkingHours: jest.fn().mockResolvedValue({ workingHours: [] }),
  checkWorkingHoursConflicts: jest.fn().mockResolvedValue({ hasConflicts: false }),
  updateWorkingHours: jest.fn().mockResolvedValue({ message: 'Updated' }),
};

describe('WorkingHoursController', () => {
  let controller: WorkingHoursController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkingHoursController],
      providers: [{ provide: WorkingHoursService, useValue: mockWorkingHoursService }],
    }).compile();

    controller = module.get<WorkingHoursController>(WorkingHoursController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('addWorkingHours() calls service with doctorId from req', async () => {
    const dto = { workingHours: [], inspectionDuration: 30 } as any;
    await controller.addWorkingHours(dto, makeReq() as any);
    expect(mockWorkingHoursService.addWorkingHours).toHaveBeenCalledWith(realDoctorId.toString(), dto);
  });

  it('getWorkingHours() calls service with doctorId from req', async () => {
    await controller.getWorkingHours(makeReq() as any);
    expect(mockWorkingHoursService.getWorkingHours).toHaveBeenCalledWith(realDoctorId.toString());
  });

  it('checkConflicts() calls service with doctorId from req and update dto', async () => {
    const dto = { workingHours: [] } as any;
    await controller.checkConflicts(dto, makeReq() as any);
    expect(mockWorkingHoursService.checkWorkingHoursConflicts).toHaveBeenCalledWith(realDoctorId.toString(), dto);
  });

  it('updateWorkingHours() calls service with doctorId and update dto', async () => {
    const dto = { workingHours: [] } as any;
    await controller.updateWorkingHours(dto, makeReq() as any);
    expect(mockWorkingHoursService.updateWorkingHours).toHaveBeenCalledWith(realDoctorId.toString(), dto);
  });
});
