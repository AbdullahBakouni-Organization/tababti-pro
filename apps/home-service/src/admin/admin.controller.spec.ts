import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

// Mock the SubCities schema to avoid Mongoose class constructor issues in tests
jest.mock('@app/common/database/schemas/sub-cities.schema', () => ({
  SubCities: { DAMASCUS: 'DAMASCUS', ALEPPO: 'ALEPPO' },
  SubCitiesSchema: {},
}));

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthValidateService } from '@app/common/auth-validate';

const realAdminId = new Types.ObjectId();
const realDoctorId = new Types.ObjectId();
const realPostId = new Types.ObjectId();

const makeAdminReq = () => ({
  user: {
    accountId: realAdminId.toString(),
    entity: { _id: { toString: () => realAdminId.toString() } },
  },
});

const mockAdminService = {
  signIn: jest.fn().mockResolvedValue({
    _id: realAdminId,
    authAccountId: realAdminId,
    username: 'Admin User',
    phone: '+963912345678',
  }),
  approveDoctor: jest.fn().mockResolvedValue({ success: true }),
  rejectedDoctor: jest.fn().mockResolvedValue({ success: true }),
  approveGalleryImages: jest.fn().mockResolvedValue({ success: true }),
  rejectGalleryImages: jest.fn().mockResolvedValue({ success: true }),
  getPosts: jest.fn().mockResolvedValue({ data: [] }),
  approvePost: jest.fn().mockResolvedValue({ success: true }),
  rejectPost: jest.fn().mockResolvedValue({ success: true }),
  getQuestions: jest.fn().mockResolvedValue({ data: [] }),
  approveQuestions: jest.fn().mockResolvedValue({ success: true }),
  rejectQuestions: jest.fn().mockResolvedValue({ success: true }),
  getDoctors: jest.fn().mockResolvedValue({ data: [] }),
  getDoctorById: jest.fn().mockResolvedValue({ _id: realDoctorId }),
  getAllPendingGalleryImages: jest.fn().mockResolvedValue([]),
  getGalleryImages: jest.fn().mockResolvedValue([]),
};

const mockAuthValidateService = {
  createSession: jest.fn().mockResolvedValue({
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
  }),
  refreshAccessToken: jest.fn().mockResolvedValue({ accessToken: 'new-token' }),
  refreshUserAccessToken: jest.fn().mockResolvedValue({
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
  }),
  logoutAllSessions: jest.fn().mockResolvedValue(undefined),
};

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: AuthValidateService, useValue: mockAuthValidateService },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('signIn() calls adminService.signIn with dto', async () => {
    const dto = {
      username: 'admin',
      password: 'pass',
      deviceInfo: {
        deviceId: 'dev-1',
        deviceName: 'iPhone',
        deviceType: 'mobile',
        platform: 'iOS',
      },
    } as any;
    const res = { cookie: jest.fn() } as any;
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'user-agent': 'test' },
    } as any;
    await controller.signIn(dto, res, req);
    expect(mockAdminService.signIn).toHaveBeenCalledWith(dto);
  });

  it('approveDoctor() calls adminService.approveDoctor', async () => {
    await controller.approveDoctor(
      realDoctorId.toString(),
      makeAdminReq() as any,
    );
    expect(mockAdminService.approveDoctor).toHaveBeenCalledWith(
      realDoctorId.toString(),
      expect.anything(),
    );
  });

  it('rejectDoctor() calls adminService.rejectedDoctor with (doctorId, adminId, reason)', async () => {
    await controller.rejectDoctor(
      realDoctorId.toString(),
      'Not qualified',
      makeAdminReq() as any,
    );
    // Controller calls rejectedDoctor(doctorId, adminId, reason)
    expect(mockAdminService.rejectedDoctor).toHaveBeenCalledWith(
      realDoctorId.toString(),
      expect.any(String),
      'Not qualified',
    );
  });

  it('getDoctors() calls adminService.getDoctors', async () => {
    const filter = { page: 1, limit: 10 } as any;
    await controller.getDoctors(filter);
    expect(mockAdminService.getDoctors).toHaveBeenCalledWith(filter);
  });

  it('getDoctorById() calls adminService.getDoctorById', async () => {
    await controller.getDoctorById(realDoctorId.toString());
    expect(mockAdminService.getDoctorById).toHaveBeenCalledWith(
      realDoctorId.toString(),
    );
  });

  it('approvePost() calls adminService.approvePost', async () => {
    await controller.approvePost(
      realPostId.toString(),
      {} as any,
      makeAdminReq() as any,
    );
    expect(mockAdminService.approvePost).toHaveBeenCalledWith(
      realPostId.toString(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('rejectPost() calls adminService.rejectPost', async () => {
    await controller.rejectPost(
      realPostId.toString(),
      {} as any,
      makeAdminReq() as any,
    );
    expect(mockAdminService.rejectPost).toHaveBeenCalledWith(
      realPostId.toString(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('approveQuestions() calls adminService.approveQuestions', async () => {
    const questionId = new Types.ObjectId().toString();
    await controller.approveQuestions(
      { questionIds: [questionId] } as any,
      makeAdminReq() as any,
    );
    expect(mockAdminService.approveQuestions).toHaveBeenCalled();
  });

  it('rejectQuestions() calls adminService.rejectQuestions', async () => {
    const questionId = new Types.ObjectId().toString();
    await controller.rejectQuestions(
      { questionIds: [questionId] } as any,
      makeAdminReq() as any,
    );
    expect(mockAdminService.rejectQuestions).toHaveBeenCalled();
  });
});
