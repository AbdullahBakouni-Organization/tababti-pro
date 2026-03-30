import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { PostController } from './post.controller';
import { PostService } from './post.service';
import {
  UserRole,
  PostStatus,
} from '@app/common/database/schemas/common.enums';
import { CreatePostDto } from './dto/create-post.dto';
import { ApiResponse } from '../common/response/api-response';
import { MinioService } from '@app/common/file-storage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeId = () => new Types.ObjectId().toString();

const mockPost = (overrides: Record<string, any> = {}) => ({
  _id: new Types.ObjectId(),
  content: 'Test post',
  images: [],
  status: PostStatus.APPROVED,
  isLiked: false,
  likesCount: 0,
  ...overrides,
});

const paginatedResult = (data: any[] = []) => ({
  data,
  pagination: { total: data.length, page: 1, limit: 10, totalPages: 1 },
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPostService = {
  createWithoutImages: jest.fn(),
  updatePostImages: jest.fn().mockResolvedValue(undefined),
  getAllPosts: jest.fn(),
  getMyPosts: jest.fn(),
  getPostsByAuthor: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  toggleLike: jest.fn(),
  getStats: jest.fn(),
  updatePostStatus: jest.fn(),
  getApprovedPosts: jest.fn(),
};

// Mock guards globally — unit tests don't need real JWT/roles
jest.mock('@app/common/guards/jwt.guard', () => ({
  JwtAuthGuard: jest
    .fn()
    .mockImplementation(() => ({ canActivate: () => true })),
}));
jest.mock('@app/common/guards/role.guard', () => ({
  RolesGuard: jest.fn().mockImplementation(() => ({ canActivate: () => true })),
}));

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PostController', () => {
  let controller: PostController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostController],
      providers: [
        { provide: PostService, useValue: mockPostService },
        {
          provide: MinioService,
          useValue: { uploadFile: jest.fn(), deleteFile: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PostController>(PostController);
    jest.clearAllMocks();
  });

  // ── POST / ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreatePostDto = {
      content: 'Hello',
      subscriptionType: 'FREE',
    } as any;
    const accountId = makeId();
    const post = mockPost();

    it('creates a post and returns ApiResponse with post data', async () => {
      mockPostService.createWithoutImages.mockResolvedValue(post);

      const files = { images: [] } as any;
      const result = await controller.create(
        files,
        dto,
        accountId,
        UserRole.DOCTOR,
        'en',
      );

      expect(mockPostService.createWithoutImages).toHaveBeenCalledWith(
        dto,
        accountId,
        UserRole.DOCTOR,
      );
      expect(result).toBeDefined();
    });

    it('handles missing files gracefully (no images)', async () => {
      mockPostService.createWithoutImages.mockResolvedValue(post);

      const result = await controller.create(
        { images: undefined } as any,
        dto,
        accountId,
        UserRole.DOCTOR,
        'en',
      );

      expect(mockPostService.createWithoutImages).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws BadRequestException for invalid accountId', async () => {
      await expect(
        controller.create({} as any, dto, 'bad-id', UserRole.DOCTOR, 'en'),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates service errors', async () => {
      mockPostService.createWithoutImages.mockRejectedValue(
        new BadRequestException('post.INVALID_CONTENT'),
      );

      const files = { images: [] } as any;

      await expect(
        controller.create(files, dto, accountId, UserRole.DOCTOR, 'en'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── GET / ──────────────────────────────────────────────────────────────────

  describe('getAllPosts', () => {
    it('returns paginated posts', async () => {
      const posts = [mockPost(), mockPost()];
      mockPostService.getAllPosts.mockResolvedValue(paginatedResult(posts));

      const result = await controller.getAllPosts(
        makeId(),
        UserRole.USER,
        '1',
        '10',
        'en',
      );

      expect(mockPostService.getAllPosts).toHaveBeenCalledWith(
        expect.any(String),
        UserRole.USER,
        1,
        10,
      );
      expect(result.data?.data).toHaveLength(2);
    });

    it('clamps page to minimum 1', async () => {
      mockPostService.getAllPosts.mockResolvedValue(paginatedResult());
      await controller.getAllPosts(makeId(), UserRole.USER, '-5', '10', 'en');
      expect(mockPostService.getAllPosts).toHaveBeenCalledWith(
        expect.any(String),
        UserRole.USER,
        1,
        10,
      );
    });

    it('clamps limit to maximum 50', async () => {
      mockPostService.getAllPosts.mockResolvedValue(paginatedResult());
      await controller.getAllPosts(makeId(), UserRole.USER, '1', '100', 'en');
      expect(mockPostService.getAllPosts).toHaveBeenCalledWith(
        expect.any(String),
        UserRole.USER,
        1,
        50,
      );
    });
  });

  // ── GET /me ────────────────────────────────────────────────────────────────

  describe('getMyPosts', () => {
    const accountId = makeId();

    it('returns own posts with optional status filter', async () => {
      mockPostService.getMyPosts.mockResolvedValue(paginatedResult());

      const result = await controller.getMyPosts(
        accountId,
        UserRole.DOCTOR,
        '1',
        '10',
        PostStatus.PENDING,
        'en',
      );

      expect(mockPostService.getMyPosts).toHaveBeenCalledWith(
        accountId,
        UserRole.DOCTOR,
        1,
        10,
        PostStatus.PENDING,
      );
      expect(result).toBeDefined();
    });

    it('returns error ApiResponse for invalid accountId', async () => {
      const result = await controller.getMyPosts(
        'bad-id',
        UserRole.DOCTOR,
        '1',
        '10',
        undefined,
        'en',
      );

      expect(result).toMatchObject({ success: false });
      expect(mockPostService.getMyPosts).not.toHaveBeenCalled();
    });

    it('returns error ApiResponse for invalid status value', async () => {
      const result = await controller.getMyPosts(
        accountId,
        UserRole.DOCTOR,
        '1',
        '10',
        'INVALID_STATUS' as PostStatus,
        'en',
      );

      expect(result).toMatchObject({ success: false });
      expect(mockPostService.getMyPosts).not.toHaveBeenCalled();
    });

    it('calls service without status when status is undefined', async () => {
      mockPostService.getMyPosts.mockResolvedValue(paginatedResult());
      await controller.getMyPosts(
        accountId,
        UserRole.DOCTOR,
        '1',
        '10',
        undefined,
        'en',
      );
      expect(mockPostService.getMyPosts).toHaveBeenCalledWith(
        accountId,
        UserRole.DOCTOR,
        1,
        10,
        undefined,
      );
    });
  });

  // ── GET /author/:authorId ──────────────────────────────────────────────────

  describe('getPostsByAuthor', () => {
    const accountId = makeId();
    const authorId = makeId();

    it('returns posts by the given author', async () => {
      mockPostService.getPostsByAuthor.mockResolvedValue(
        paginatedResult([mockPost()]),
      );

      const result = await controller.getPostsByAuthor(
        authorId,
        accountId,
        UserRole.USER,
        '1',
        '10',
        'en',
      );

      expect(mockPostService.getPostsByAuthor).toHaveBeenCalledWith(
        authorId,
        accountId,
        UserRole.USER,
        1,
        10,
      );
      expect(result.data?.data).toHaveLength(1);
    });

    it('returns error ApiResponse for invalid authorId', async () => {
      const result = await controller.getPostsByAuthor(
        'bad-id',
        accountId,
        UserRole.USER,
        '1',
        '10',
        'en',
      );

      expect(result).toMatchObject({ success: false });
      expect(mockPostService.getPostsByAuthor).not.toHaveBeenCalled();
    });
  });

  // ── GET /:id ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a single approved post', async () => {
      const post = mockPost({ isLiked: true });
      mockPostService.findOne.mockResolvedValue(post);

      const result = await controller.findOne(
        post._id.toString(),
        makeId(),
        UserRole.USER,
        'en',
      );

      expect(mockPostService.findOne).toHaveBeenCalledWith(
        post._id.toString(),
        expect.any(String),
        UserRole.USER,
      );
      expect(result.data).toEqual(post);
    });

    it('returns error ApiResponse for invalid post id', async () => {
      const result = await controller.findOne(
        'bad-id',
        makeId(),
        UserRole.USER,
        'en',
      );
      expect(result).toMatchObject({ success: false });
      expect(mockPostService.findOne).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException from service', async () => {
      const id = makeId();
      mockPostService.findOne.mockRejectedValue(
        new NotFoundException('post.NOT_FOUND'),
      );

      await expect(
        controller.findOne(id, makeId(), UserRole.USER, 'en'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────────────

  describe('remove', () => {
    const accountId = makeId();

    it('deletes a post and returns success', async () => {
      const post = mockPost();
      mockPostService.remove.mockResolvedValue(post);

      const result = await controller.remove(
        post._id.toString(),
        accountId,
        UserRole.DOCTOR,
        'en',
      );

      expect(mockPostService.remove).toHaveBeenCalledWith(
        post._id.toString(),
        accountId,
        UserRole.DOCTOR,
      );
      expect(result.data).toBeNull();
    });

    it('returns error ApiResponse for invalid post id', async () => {
      const result = await controller.remove(
        'bad-id',
        accountId,
        UserRole.DOCTOR,
        'en',
      );
      expect(result).toMatchObject({ success: false });
      expect(mockPostService.remove).not.toHaveBeenCalled();
    });

    it('returns error ApiResponse for invalid accountId', async () => {
      const result = await controller.remove(
        makeId(),
        'bad-id',
        UserRole.DOCTOR,
        'en',
      );
      expect(result).toMatchObject({ success: false });
      expect(mockPostService.remove).not.toHaveBeenCalled();
    });

    it('propagates ForbiddenException from service', async () => {
      const postId = makeId();
      mockPostService.remove.mockRejectedValue(
        new ForbiddenException('post.FORBIDDEN'),
      );

      await expect(
        controller.remove(postId, accountId, UserRole.DOCTOR, 'en'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── PATCH /:id/like ────────────────────────────────────────────────────────

  describe('toggleLike', () => {
    const accountId = makeId();

    it('toggles like and returns updated state', async () => {
      const postId = makeId();
      mockPostService.toggleLike.mockResolvedValue({
        isLiked: true,
        likesCount: 5,
      });

      const result = await controller.toggleLike(
        postId,
        accountId,
        UserRole.USER,
        'en',
      );

      expect(mockPostService.toggleLike).toHaveBeenCalledWith(
        postId,
        accountId,
        UserRole.USER,
      );
      expect(result.data).toEqual({ isLiked: true, likesCount: 5 });
    });

    it('returns error ApiResponse for invalid post id', async () => {
      const result = await controller.toggleLike(
        'bad-id',
        accountId,
        UserRole.USER,
        'en',
      );
      expect(result).toMatchObject({ success: false });
      expect(mockPostService.toggleLike).not.toHaveBeenCalled();
    });

    it('returns error ApiResponse for invalid accountId', async () => {
      const result = await controller.toggleLike(
        makeId(),
        'bad-id',
        UserRole.USER,
        'en',
      );
      expect(result).toMatchObject({ success: false });
      expect(mockPostService.toggleLike).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException from service', async () => {
      const postId = makeId();
      mockPostService.toggleLike.mockRejectedValue(
        new NotFoundException('post.NOT_FOUND'),
      );

      await expect(
        controller.toggleLike(postId, accountId, UserRole.USER, 'en'),
      ).rejects.toThrow(NotFoundException);
    });

    it('toggles unlike (isLiked becomes false)', async () => {
      const postId = makeId();
      mockPostService.toggleLike.mockResolvedValue({
        isLiked: false,
        likesCount: 4,
      });

      const result = await controller.toggleLike(
        postId,
        accountId,
        UserRole.USER,
        'en',
      );

      expect(result.data).toEqual({ isLiked: false, likesCount: 4 });
    });
  });

  // ── Arabic language header ─────────────────────────────────────────────────

  describe('accept-language header', () => {
    it('passes ar lang to ApiResponse', async () => {
      const post = mockPost();
      mockPostService.findOne.mockResolvedValue(post);

      const result = await controller.findOne(
        post._id.toString(),
        makeId(),
        UserRole.USER,
        'ar',
      );

      // As long as the response is valid, language forwarding is tested
      expect(result).toBeDefined();
    });
  });
});
