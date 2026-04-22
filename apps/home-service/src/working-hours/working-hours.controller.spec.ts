import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { WorkingHoursController } from './working-hours.controller';
import { WorkingHoursService } from './working-hours.service';

const realDoctorId = new Types.ObjectId();
const makeReq = () => ({
  user: { entity: { _id: { toString: () => realDoctorId.toString() } } },
});

const mockWorkingHoursService = {
  addWorkingHours: jest.fn().mockResolvedValue({
    message: 'Added',
    doctorId: realDoctorId.toString(),
    workingHours: [],
  }),
  getWorkingHours: jest.fn().mockResolvedValue({ workingHours: [] }),
  checkWorkingHoursConflicts: jest
    .fn()
    .mockResolvedValue({ hasConflicts: false }),
  updateWorkingHours: jest.fn().mockResolvedValue({ message: 'Updated' }),
  getPhase2ProcessingStatus: jest.fn().mockResolvedValue({
    phase2Running: false,
    operation: null,
    startedAt: null,
  }),
};

describe('WorkingHoursController', () => {
  let controller: WorkingHoursController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkingHoursController],
      providers: [
        { provide: WorkingHoursService, useValue: mockWorkingHoursService },
      ],
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
    expect(mockWorkingHoursService.addWorkingHours).toHaveBeenCalledWith(
      realDoctorId.toString(),
      dto,
    );
  });

  it('getWorkingHours() calls service with doctorId from req', async () => {
    await controller.getWorkingHours(makeReq() as any);
    expect(mockWorkingHoursService.getWorkingHours).toHaveBeenCalledWith(
      realDoctorId.toString(),
    );
  });

  it('checkConflicts() calls service with doctorId from req and update dto', async () => {
    const dto = { workingHours: [] } as any;
    await controller.checkConflicts(dto, makeReq() as any);
    expect(
      mockWorkingHoursService.checkWorkingHoursConflicts,
    ).toHaveBeenCalledWith(realDoctorId.toString(), dto);
  });

  it('updateWorkingHours() calls service with doctorId and update dto', async () => {
    const dto = { workingHours: [] } as any;
    await controller.updateWorkingHours(dto, makeReq() as any);
    expect(mockWorkingHoursService.updateWorkingHours).toHaveBeenCalledWith(
      realDoctorId.toString(),
      dto,
    );
  });

  it('getProcessingStatus() calls service with doctorId from req and returns its payload verbatim', async () => {
    const payload = {
      phase2Running: true,
      operation: 'update' as const,
      startedAt: '2026-04-22T06:11:52.000Z',
    };
    mockWorkingHoursService.getPhase2ProcessingStatus.mockResolvedValueOnce(
      payload,
    );

    const result = await controller.getProcessingStatus(makeReq() as any);

    expect(
      mockWorkingHoursService.getPhase2ProcessingStatus,
    ).toHaveBeenCalledWith(realDoctorId.toString());
    // Shape must be passed through unchanged — frontend contract.
    expect(result).toEqual(payload);
  });

  it('getProcessingStatus() passes through the idle shape when no phase 2 is running', async () => {
    mockWorkingHoursService.getPhase2ProcessingStatus.mockResolvedValueOnce({
      phase2Running: false,
      operation: null,
      startedAt: null,
    });

    const result = await controller.getProcessingStatus(makeReq() as any);

    expect(result).toEqual({
      phase2Running: false,
      operation: null,
      startedAt: null,
    });
  });
});
