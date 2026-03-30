import { Test, TestingModule } from '@nestjs/testing';
import { EntityProfileController } from './entity-profile.controller';
import { EntityProfileService } from './entity-profile.service';
import { UserRole } from '@app/common/database/schemas/common.enums';

describe('EntityProfileController', () => {
  let controller: EntityProfileController;

  const mockService = {
    getEntityProfile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntityProfileController],
      providers: [{ provide: EntityProfileService, useValue: mockService }],
    }).compile();

    controller = module.get<EntityProfileController>(EntityProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getEntityProfile()', () => {
    it('delegates to service with correct args and returns result directly', async () => {
      const profile = {
        type: UserRole.DOCTOR,
        id: 'doc-1',
        fullName: 'Ali Ahmad',
      };
      mockService.getEntityProfile.mockResolvedValue(profile);

      const result = await controller.getEntityProfile(
        'doc-1',
        UserRole.DOCTOR,
        1,
        10,
        'en',
      );

      expect(mockService.getEntityProfile).toHaveBeenCalledWith(
        'doc-1',
        UserRole.DOCTOR,
        1,
        10,
      );
      expect(result).toEqual(profile);
    });

    it('converts string galleryPage/galleryLimit to numbers', async () => {
      mockService.getEntityProfile.mockResolvedValue({});

      await controller.getEntityProfile(
        'doc-1',
        UserRole.HOSPITAL,
        '2' as any,
        '5' as any,
        'ar',
      );

      expect(mockService.getEntityProfile).toHaveBeenCalledWith(
        'doc-1',
        UserRole.HOSPITAL,
        2,
        5,
      );
    });
  });
});
