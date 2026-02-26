import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { PostService } from './post.service';
import { PostRepository } from './post.repository';
import { User } from '@app/common/database/schemas/user.schema';
import { Doctor } from '@app/common/database/schemas/doctor.schema';
import { Hospital } from '@app/common/database/schemas/hospital.schema';
import { Center } from '@app/common/database/schemas/center.schema';
import {
  UserRole,
  PostStatus,
} from '@app/common/database/schemas/common.enums';
import { CreatePostDto } from './dto/create-post.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeId = () => new Types.ObjectId().toString();

const mockProfile = (overrides: Record<string, any> = {}) => ({
  _id: new Types.ObjectId(),
  authAccountId: new Types.ObjectId(),
  ...overrides,
});

const mockPost = (overrides: Record<string, any> = {}) => ({
  _id: new Types.ObjectId(),
  authorId: new Types.ObjectId(),
  authorType: UserRole.DOCTOR,
  content: 'Test content',
  images: [],
  status: PostStatus.APPROVED,
  likedBy: [],
  likesCount: 0,
  usageCount: 0,
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPostRepo = {
  create: jest.fn(),
  findAll: jest.fn(),
  findMyPosts: jest.fn(),
  findByAuthor: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
  toggleLike: jest.fn(),
};

const makeMockModel = () => ({
  findOne: jest.fn(),
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PostService', () => {
  let service: PostService;
  let userModel: ReturnType<typeof makeMockModel>;
  let doctorModel: ReturnType<typeof makeMockModel>;
  let hospitalModel: ReturnType<typeof makeMockModel>;
  let centerModel: ReturnType<typeof makeMockModel>;

  beforeEach(async () => {
    userModel = makeMockModel();
    doctorModel = makeMockModel();
    hospitalModel = makeMockModel();
    centerModel = makeMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PostRepository, useValue: mockPostRepo },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Doctor.name), useValue: doctorModel },
        { provide: getModelToken(Hospital.name), useValue: hospitalModel },
        { provide: getModelToken(Center.name), useValue: centerModel },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
    jest.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreatePostDto = {
      content: 'Hello world',
      subscriptionType: 'FREE',
    } as any;
    const accountId = makeId();
    const profile = mockProfile();

    it('creates a post successfully', async () => {
      doctorModel.findOne.mockReturnValue({ lean: () => profile });
      mockPostRepo.create.mockResolvedValue({ ...profile, ...dto });

      const result = await service.create(
        dto,
        ['img1.jpg'],
        accountId,
        UserRole.DOCTOR,
      );

      expect(doctorModel.findOne).toHaveBeenCalledWith({
        authAccountId: new Types.ObjectId(accountId),
      });
      expect(mockPostRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: profile._id,
          authorType: UserRole.DOCTOR,
          content: dto.content,
          images: ['img1.jpg'],
          status: PostStatus.PENDING,
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws BadRequestException when content is empty and no images', async () => {
      const emptyDto: CreatePostDto = {
        content: '   ',
        subscriptionType: 'FREE',
      } as any;
      await expect(
        service.create(emptyDto, [], accountId, UserRole.DOCTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an invalid accountId', async () => {
      await expect(
        service.create(dto, [], 'not-an-object-id', UserRole.DOCTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when author profile is not found', async () => {
      doctorModel.findOne.mockReturnValue({ lean: () => null });
      await expect(
        service.create(dto, [], accountId, UserRole.DOCTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for an unknown role', async () => {
      await expect(
        service.create(dto, ['img.jpg'], accountId, 'ADMIN' as UserRole),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows creation with images even when content is empty', async () => {
      const noContentDto: CreatePostDto = {
        content: '',
        subscriptionType: 'FREE',
      } as any;
      doctorModel.findOne.mockReturnValue({ lean: () => profile });
      mockPostRepo.create.mockResolvedValue({});

      await expect(
        service.create(noContentDto, ['img.jpg'], accountId, UserRole.DOCTOR),
      ).resolves.toBeDefined();
    });
  });

  // ── getAllPosts ──────────────────────────────────────────────────────────────

  describe('getAllPosts', () => {
    it('calls findAll with resolved profileId', async () => {
      const accountId = makeId();
      const profile = mockProfile();
      userModel.findOne.mockReturnValue({
        lean: () => profile,
      });
      mockPostRepo.findAll.mockResolvedValue({ data: [], pagination: {} });

      await service.getAllPosts(accountId, UserRole.USER, 1, 10);

      expect(mockPostRepo.findAll).toHaveBeenCalledWith(
        profile._id.toString(),
        1,
        10,
      );
    });

    it('passes null profileId when accountId is invalid', async () => {
      mockPostRepo.findAll.mockResolvedValue({ data: [], pagination: {} });

      await service.getAllPosts('bad-id', UserRole.USER, 1, 10);

      expect(mockPostRepo.findAll).toHaveBeenCalledWith(null, 1, 10);
    });
  });

  // ── getMyPosts ──────────────────────────────────────────────────────────────

  describe('getMyPosts', () => {
    it('calls findMyPosts with resolved authorId', async () => {
      const accountId = makeId();
      const profile = mockProfile();
      doctorModel.findOne.mockReturnValue({ lean: () => profile });
      mockPostRepo.findMyPosts.mockResolvedValue({ data: [], pagination: {} });

      await service.getMyPosts(
        accountId,
        UserRole.DOCTOR,
        1,
        10,
        PostStatus.PENDING,
      );

      expect(mockPostRepo.findMyPosts).toHaveBeenCalledWith(
        profile._id.toString(),
        1,
        10,
        PostStatus.PENDING,
      );
    });

    it('throws NotFoundException when doctor profile not found', async () => {
      doctorModel.findOne.mockReturnValue({ lean: () => null });
      await expect(
        service.getMyPosts(makeId(), UserRole.DOCTOR, 1, 10),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPostsByAuthor ─────────────────────────────────────────────────────────

  describe('getPostsByAuthor', () => {
    it('calls findByAuthor with resolved profileId', async () => {
      const accountId = makeId();
      const authorId = makeId();
      const profile = mockProfile();
      userModel.findOne.mockReturnValue({ lean: () => profile });
      mockPostRepo.findByAuthor.mockResolvedValue({ data: [], pagination: {} });

      await service.getPostsByAuthor(authorId, accountId, UserRole.USER, 1, 10);

      expect(mockPostRepo.findByAuthor).toHaveBeenCalledWith(
        authorId,
        profile._id.toString(),
        1,
        10,
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns post with isLiked=true when current user liked it', async () => {
      const accountId = makeId();
      const profile = mockProfile();
      const post = mockPost({ likedBy: [profile._id] });

      mockPostRepo.findOne.mockResolvedValue(post);
      userModel.findOne.mockReturnValue({ lean: () => profile });

      const result = await service.findOne(
        post._id.toString(),
        accountId,
        UserRole.USER,
      );

      expect(result.isLiked).toBe(true);
      expect(result.likedBy).toBeUndefined();
    });

    it('returns post with isLiked=false when current user has not liked it', async () => {
      const accountId = makeId();
      const profile = mockProfile();
      const post = mockPost({ likedBy: [] });

      mockPostRepo.findOne.mockResolvedValue(post);
      userModel.findOne.mockReturnValue({ lean: () => profile });

      const result = await service.findOne(
        post._id.toString(),
        accountId,
        UserRole.USER,
      );

      expect(result.isLiked).toBe(false);
    });

    it('throws NotFoundException when post not found', async () => {
      mockPostRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findOne(makeId(), makeId(), UserRole.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when post is not APPROVED', async () => {
      const post = mockPost({ status: PostStatus.PENDING });
      mockPostRepo.findOne.mockResolvedValue(post);

      await expect(
        service.findOne(post._id.toString(), makeId(), UserRole.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets isLiked=false when profileId cannot be resolved', async () => {
      const post = mockPost({ likedBy: [new Types.ObjectId()] });
      mockPostRepo.findOne.mockResolvedValue(post);
      userModel.findOne.mockReturnValue({ lean: () => null });

      const result = await service.findOne(
        post._id.toString(),
        makeId(),
        UserRole.USER,
      );

      expect(result.isLiked).toBe(false);
    });

    it('strips likedBy from the returned object', async () => {
      const accountId = makeId();
      const profile = mockProfile();
      const post = mockPost({ likedBy: [profile._id] });

      mockPostRepo.findOne.mockResolvedValue(post);
      userModel.findOne.mockReturnValue({ lean: () => profile });

      const result = await service.findOne(
        post._id.toString(),
        accountId,
        UserRole.USER,
      );

      expect('likedBy' in result).toBe(false);
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a post when the requester is the author', async () => {
      const accountId = makeId();
      const profile = mockProfile();
      const post = mockPost({
        authorId: profile._id,
        authorType: UserRole.DOCTOR,
      });

      mockPostRepo.findOne.mockResolvedValue(post);
      doctorModel.findOne.mockReturnValue({ lean: () => profile });
      mockPostRepo.delete.mockResolvedValue(post);

      await expect(
        service.remove(post._id.toString(), accountId, UserRole.DOCTOR),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException when post does not exist', async () => {
      mockPostRepo.findOne.mockResolvedValue(null);
      await expect(
        service.remove(makeId(), makeId(), UserRole.DOCTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when requester is not the author', async () => {
      const profile = mockProfile();
      const differentProfile = mockProfile(); // different _id
      const post = mockPost({
        authorId: differentProfile._id,
        authorType: UserRole.DOCTOR,
      });

      mockPostRepo.findOne.mockResolvedValue(post);
      doctorModel.findOne.mockReturnValue({ lean: () => profile });

      await expect(
        service.remove(post._id.toString(), makeId(), UserRole.DOCTOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when author profile is not found', async () => {
      const post = mockPost({ authorType: UserRole.DOCTOR });
      mockPostRepo.findOne.mockResolvedValue(post);
      doctorModel.findOne.mockReturnValue({ lean: () => null });

      await expect(
        service.remove(post._id.toString(), makeId(), UserRole.DOCTOR),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── toggleLike ───────────────────────────────────────────────────────────────

  describe('toggleLike', () => {
    it('toggles like on an approved post', async () => {
      const accountId = makeId();
      const profile = mockProfile();
      const post = mockPost();

      mockPostRepo.findOne.mockResolvedValue(post);
      doctorModel.findOne.mockReturnValue({ lean: () => profile });
      mockPostRepo.toggleLike.mockResolvedValue({
        isLiked: true,
        likesCount: 1,
      });

      const result = await service.toggleLike(
        post._id.toString(),
        accountId,
        UserRole.DOCTOR,
      );

      expect(mockPostRepo.toggleLike).toHaveBeenCalledWith(
        post._id.toString(),
        profile._id.toString(),
      );
      expect(result).toEqual({ isLiked: true, likesCount: 1 });
    });

    it('throws NotFoundException when post does not exist', async () => {
      mockPostRepo.findOne.mockResolvedValue(null);
      await expect(
        service.toggleLike(makeId(), makeId(), UserRole.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when post is not APPROVED', async () => {
      const post = mockPost({ status: PostStatus.REJECTED });
      mockPostRepo.findOne.mockResolvedValue(post);

      await expect(
        service.toggleLike(post._id.toString(), makeId(), UserRole.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when author profile not found', async () => {
      const post = mockPost();
      mockPostRepo.findOne.mockResolvedValue(post);
      userModel.findOne.mockReturnValue({ lean: () => null });

      await expect(
        service.toggleLike(post._id.toString(), makeId(), UserRole.USER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getAuthorModel (edge cases) ──────────────────────────────────────────────

  describe('role-based model selection', () => {
    it.each([
      [UserRole.USER, 'userModel'],
      [UserRole.DOCTOR, 'doctorModel'],
      [UserRole.HOSPITAL, 'hospitalModel'],
      [UserRole.CENTER, 'centerModel'],
    ])('uses the correct model for role %s', async (role, modelKey) => {
      const accountId = makeId();
      const profile = mockProfile();
      const models: Record<string, ReturnType<typeof makeMockModel>> = {
        userModel,
        doctorModel,
        hospitalModel,
        centerModel,
      };

      models[modelKey].findOne.mockReturnValue({ lean: () => profile });
      mockPostRepo.findAll.mockResolvedValue({ data: [], pagination: {} });

      await service.getAllPosts(accountId, role, 1, 10);

      expect(models[modelKey].findOne).toHaveBeenCalled();
    });
  });
});
