import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';
import { Admin } from '@app/common/database/schemas/admin.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import { Question } from '@app/common/database/schemas/question.schema';
import { User } from '@app/common/database/schemas/user.schema';
import { AuthAccount } from '@app/common/database/schemas/auth.schema';
import { Post } from '@app/common/database/schemas/post.schema';
import { Booking } from '@app/common/database/schemas/booking.schema';
import { KafkaService } from '@app/common/kafka/kafka.service';
import { MinioService } from '@app/common/file-storage';
import { CacheService } from '@app/common';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import {
  createMockCacheService,
  createMockKafkaService,
  createMockMinioService,
  createMockModel,
} from '@app/common/testing';
import {
  ApprovalStatus,
  GalleryImageStatus,
  PostStatus,
} from '@app/common/database/schemas/common.enums';

jest.mock('bcrypt');

describe('AdminService', () => {
  let service: AdminService;
  let adminModel: ReturnType<typeof createMockModel>;
  let doctorModel: ReturnType<typeof createMockModel>;
  let postModel: ReturnType<typeof createMockModel>;
  let hospitalModel: ReturnType<typeof createMockModel>;
  let centerModel: ReturnType<typeof createMockModel>;
  let questionModel: ReturnType<typeof createMockModel>;
  let patientModel: ReturnType<typeof createMockModel>;
  let authAccountModel: ReturnType<typeof createMockModel>;
  let kafkaService: ReturnType<typeof createMockKafkaService>;
  let minioService: ReturnType<typeof createMockMinioService>;

  const adminId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();
  const postId = new Types.ObjectId();

  // Mock session
  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
    inTransaction: jest.fn().mockReturnValue(true),
  };

  const mockAdmin = {
    _id: adminId,
    username: 'admin',
    phone: '+963911111111',
    password: 'hashed-password',
    isActive: true,
    lockedUntil: null,
    maxSessions: 5,
    lastLoginAt: null,
    authAccountId: new Types.ObjectId(),
    incrementFailedAttempts: jest.fn(),
    getActiveSessionsCount: jest.fn().mockReturnValue(0),
    save: jest.fn().mockResolvedValue(undefined),
    db: { startSession: jest.fn().mockResolvedValue(mockSession) },
  };

  const mockDoctor = {
    _id: doctorId,
    firstName: 'Ahmad',
    lastName: 'Khalil',
    status: ApprovalStatus.PENDING,
    authAccountId: new Types.ObjectId(),
    phones: [{ normal: ['+963912345678'] }],
    fcmToken: 'fcm-token-doctor',
    gallery: [],
    save: jest
      .fn()
      .mockResolvedValue({ _id: doctorId, status: ApprovalStatus.APPROVED }),
    db: { startSession: jest.fn().mockResolvedValue(mockSession) },
  };

  const mockPost = {
    _id: postId,
    authorId: new Types.ObjectId(),
    status: PostStatus.PENDING,
    content: 'Test post',
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    updatedAt: null,
    save: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    adminModel = createMockModel();
    doctorModel = createMockModel();
    postModel = createMockModel();
    hospitalModel = createMockModel();
    centerModel = createMockModel();
    questionModel = createMockModel();
    patientModel = createMockModel();
    authAccountModel = createMockModel();
    kafkaService = createMockKafkaService();
    minioService = createMockMinioService();

    mockSession.commitTransaction.mockResolvedValue(undefined);
    mockSession.abortTransaction.mockResolvedValue(undefined);
    mockAdmin.save.mockResolvedValue(undefined);
    mockAdmin.db.startSession.mockResolvedValue(mockSession);
    mockDoctor.save.mockResolvedValue({
      _id: doctorId,
      status: ApprovalStatus.APPROVED,
    });
    mockDoctor.db.startSession.mockResolvedValue(mockSession);

    // Expose db.startSession on model mocks
    (adminModel as any).db = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    (doctorModel as any).db = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };
    mockPost.save.mockResolvedValue(undefined);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getModelToken(Admin.name), useValue: adminModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: getModelToken(Post.name), useValue: postModel },
        { provide: getModelToken(Hospital.name), useValue: hospitalModel },
        { provide: getModelToken(Center.name), useValue: centerModel },
        { provide: getModelToken(Question.name), useValue: questionModel },
        { provide: getModelToken(User.name), useValue: patientModel },
        {
          provide: getModelToken(AuthAccount.name),
          useValue: authAccountModel,
        },
        {
          provide: getModelToken(Booking.name),
          useValue: createMockModel(),
        },
        { provide: KafkaService, useValue: kafkaService },
        { provide: MinioService, useValue: minioService },
        { provide: CacheService, useValue: createMockCacheService() },
        {
          provide: WorkingHoursService,
          useValue: {
            addWorkingHours: jest.fn(),
            checkWorkingHoursConflicts: jest.fn(),
            updateWorkingHours: jest.fn(),
            getWorkingHours: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── signIn ───────────────────────────────────────────────────────────────

  describe('signIn()', () => {
    const dto = {
      username: 'admin',
      phone: '+963911111111',
      password: 'correct-password',
    };

    it('returns admin document on valid credentials', async () => {
      adminModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAdmin),
      });
      authAccountModel.findByIdAndUpdate.mockResolvedValue(undefined);

      const result = await service.signIn(dto as any);

      expect(result).toBeDefined();
      expect(mockAdmin.save).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when admin not found', async () => {
      adminModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(service.signIn(dto as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when account is locked', async () => {
      const lockedAdmin = {
        ...mockAdmin,
        lockedUntil: new Date(Date.now() + 3600000), // locked for 1 hour
      };
      adminModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(lockedAdmin),
      });

      await expect(service.signIn(dto as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('increments failed attempts on wrong password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      adminModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(mockAdmin),
      });

      await expect(service.signIn(dto as any)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockAdmin.incrementFailedAttempts).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when max sessions reached', async () => {
      const maxSessionAdmin = {
        ...mockAdmin,
        getActiveSessionsCount: jest.fn().mockReturnValue(5),
      };
      adminModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(maxSessionAdmin),
      });

      await expect(service.signIn(dto as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when admin account is deactivated', async () => {
      const inactiveAdmin = { ...mockAdmin, isActive: false };
      adminModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(inactiveAdmin),
      });

      await expect(service.signIn(dto as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── approveDoctor ────────────────────────────────────────────────────────

  describe('approveDoctor()', () => {
    it('approves doctor and emits Kafka event', async () => {
      const approvableMock = {
        ...mockDoctor,
        status: ApprovalStatus.PENDING,
        phones: [{ normal: ['+963912345678'] }],
        firstName: 'Ahmad',
        lastName: 'Khalil',
        save: jest.fn().mockResolvedValue({
          _id: doctorId,
          phones: [{ normal: ['+963912345678'] }],
          firstName: 'Ahmad',
          lastName: 'Khalil',
          status: ApprovalStatus.APPROVED,
        }),
      };
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(approvableMock),
      });
      authAccountModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      const result = await service.approveDoctor(
        doctorId.toString(),
        adminId.toString(),
      );

      expect(result).toBeDefined();
      expect(kafkaService.emit).toHaveBeenCalledWith(
        expect.stringContaining('doctor'),
        expect.any(Object),
      );
    });

    it('throws BadRequestException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.approveDoctor(doctorId.toString(), adminId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when doctor is not PENDING', async () => {
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          ...mockDoctor,
          status: ApprovalStatus.APPROVED,
        }),
      });

      await expect(
        service.approveDoctor(doctorId.toString(), adminId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when doctor has no normalized phones', async () => {
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          ...mockDoctor,
          phones: [{ normal: [] }],
        }),
      });

      await expect(
        service.approveDoctor(doctorId.toString(), adminId.toString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── rejectedDoctor ───────────────────────────────────────────────────────

  describe('rejectedDoctor()', () => {
    it('rejects doctor and emits Kafka event', async () => {
      const rejectedDoctorMock = {
        ...mockDoctor,
        status: ApprovalStatus.PENDING,
        phones: [{ normal: ['+963912345678'] }],
        fcmToken: 'fcm-token',
        firstName: 'Ahmad',
        lastName: 'Khalil',
        save: jest.fn().mockResolvedValue({
          _id: doctorId,
          phones: [{ normal: ['+963912345678'] }],
          firstName: 'Ahmad',
          lastName: 'Khalil',
          status: ApprovalStatus.REJECTED,
        }),
      };
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(rejectedDoctorMock),
      });

      const result = await service.rejectedDoctor(
        doctorId.toString(),
        adminId.toString(),
        'Missing documents',
      );

      expect(result).toBeDefined();
      expect(kafkaService.emit).toHaveBeenCalledWith(
        expect.stringContaining('doctor'),
        expect.any(Object),
      );
    });

    it('throws BadRequestException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.rejectedDoctor(
          doctorId.toString(),
          adminId.toString(),
          'reason',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when doctor is not PENDING', async () => {
      doctorModel.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          ...mockDoctor,
          status: ApprovalStatus.REJECTED,
        }),
      });

      await expect(
        service.rejectedDoctor(
          doctorId.toString(),
          adminId.toString(),
          'reason',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── approveGalleryImages ─────────────────────────────────────────────────

  describe('approveGalleryImages()', () => {
    const imageIds = ['img-1', 'img-2'];

    it('approves images and emits Kafka notification', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          ...mockDoctor,
          gallery: [
            { imageId: 'img-1', status: GalleryImageStatus.PENDING },
            { imageId: 'img-2', status: GalleryImageStatus.PENDING },
          ],
        }),
      });
      doctorModel.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 2,
      });

      await service.approveGalleryImages(
        doctorId.toString(),
        imageIds,
        adminId.toString(),
      );

      expect(doctorModel.updateOne).toHaveBeenCalled();
      expect(kafkaService.emit).toHaveBeenCalledWith(
        expect.stringContaining('gallery'),
        expect.any(Object),
      );
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.approveGalleryImages('bad-id', imageIds, adminId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.approveGalleryImages(
          doctorId.toString(),
          imageIds,
          adminId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no images were updated', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockDoctor),
      });
      doctorModel.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 0,
      });

      await expect(
        service.approveGalleryImages(
          doctorId.toString(),
          imageIds,
          adminId.toString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── rejectGalleryImages ──────────────────────────────────────────────────

  describe('rejectGalleryImages()', () => {
    const imageIds = ['img-1'];
    const doctorWithGallery = {
      ...mockDoctor,
      gallery: [
        {
          imageId: 'img-1',
          bucket: 'doctors',
          fileName: 'img-1.jpg',
          status: GalleryImageStatus.PENDING,
        },
      ],
    };

    it('marks images as REJECTED in doctor gallery', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(doctorWithGallery),
      });
      doctorModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.rejectGalleryImages(
        doctorId.toString(),
        imageIds,
        'Inappropriate content',
        adminId.toString(),
      );

      expect(doctorModel.updateOne).toHaveBeenCalledWith(
        { _id: doctorId.toString() },
        expect.objectContaining({
          $set: { 'gallery.$[img].status': GalleryImageStatus.REJECTED },
        }),
        expect.objectContaining({ arrayFilters: expect.any(Array) }),
      );
    });

    it('throws BadRequestException for invalid doctorId', async () => {
      await expect(
        service.rejectGalleryImages(
          'bad-id',
          imageIds,
          'reason',
          adminId.toString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when images not found in doctor gallery', async () => {
      doctorModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ ...mockDoctor, gallery: [] }),
      });

      await expect(
        service.rejectGalleryImages(
          doctorId.toString(),
          imageIds,
          'reason',
          adminId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── approvePost ──────────────────────────────────────────────────────────

  describe('approvePost()', () => {
    it('approves post and returns success response', async () => {
      postModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPost),
      });
      doctorModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.approvePost(
        postId.toString(),
        {} as any,
        adminId.toString(),
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(PostStatus.APPROVED);
      expect(mockPost.save).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid post ID', async () => {
      await expect(
        service.approvePost('bad-id', {} as any, adminId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when post not found or already processed', async () => {
      postModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.approvePost(postId.toString(), {} as any, adminId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when doctor not found', async () => {
      postModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPost),
      });
      doctorModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.approvePost(postId.toString(), {} as any, adminId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── rejectPost ───────────────────────────────────────────────────────────

  describe('rejectPost()', () => {
    it('rejects post and returns success response with reason', async () => {
      postModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPost),
      });
      doctorModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoctor),
      });

      const result = await service.rejectPost(
        postId.toString(),
        { reason: 'Violates policy' } as any,
        adminId.toString(),
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(PostStatus.REJECTED);
      expect(result.reason).toBe('Violates policy');
    });

    it('throws NotFoundException when post not found', async () => {
      postModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.rejectPost(
          postId.toString(),
          { reason: 'r' } as any,
          adminId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── approveQuestions ────────────────────────────────────────────────────

  describe('approveQuestions()', () => {
    const questionIds = [new Types.ObjectId().toString()];

    it('approves questions and sends Kafka notifications per user', async () => {
      questionModel.updateMany.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      questionModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest
          .fn()
          .mockResolvedValue([
            { _id: new Types.ObjectId(), userId: new Types.ObjectId() },
          ]),
      });
      patientModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          fcmToken: 'tok',
          username: 'Ali',
        }),
      });

      await expect(
        service.approveQuestions(questionIds, adminId.toString()),
      ).resolves.not.toThrow();

      expect(questionModel.updateMany).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid question ID', async () => {
      await expect(
        service.approveQuestions(['bad-id'], adminId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no matching questions found', async () => {
      questionModel.updateMany.mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
      });

      await expect(
        service.approveQuestions(questionIds, adminId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when all questions already approved', async () => {
      questionModel.updateMany.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 0,
      });

      await expect(
        service.approveQuestions(questionIds, adminId.toString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getDoctors ───────────────────────────────────────────────────────────

  describe('getDoctors()', () => {
    it('returns paginated doctors with default pagination', async () => {
      doctorModel.aggregate
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([
          {
            _id: new Types.ObjectId(),
            firstName: 'Ali',
            middleName: 'M',
            lastName: 'K',
            createdAt: new Date(),
          },
        ]);

      const result = await service.getDoctors({} as any);

      expect(result.doctors.data).toBeDefined();
      expect(result.meta).toBeDefined();
      expect(result.meta.currentPage).toBe(1);
    });

    it('filters by status when provided', async () => {
      doctorModel.aggregate.mockResolvedValue([]);

      await service.getDoctors({ status: ApprovalStatus.PENDING } as any);

      expect(doctorModel.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({ status: ApprovalStatus.PENDING }),
          }),
        ]),
      );
    });
  });

  // ─── getDoctorById ────────────────────────────────────────────────────────

  describe('getDoctorById()', () => {
    it('returns doctor DTO when found', async () => {
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: doctorId,
          firstName: 'Ahmad',
          middleName: 'S',
          lastName: 'Khalil',
          gender: 'male',
          status: ApprovalStatus.APPROVED,
          city: 'Damascus',
          subcity: 'Mezzeh',
          publicSpecialization: 'Cardiology',
          privateSpecialization: 'Cardiology',
          createdAt: new Date(),
        }),
      });
      postModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getDoctorById(doctorId.toString());

      expect(result.doctor.doctorId).toBe(doctorId.toString());
      expect(result.doctor.firstName).toBe('Ahmad');
    });

    it('throws BadRequestException for invalid doctor ID', async () => {
      await expect(service.getDoctorById('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when doctor not found', async () => {
      doctorModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getDoctorById(doctorId.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
