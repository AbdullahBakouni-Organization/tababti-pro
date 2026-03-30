import { EntityMapper } from './entity-mapper.service';
import { Types } from 'mongoose';
import { FALLBACK_SPEEDS } from './types/nearby.types';

describe('EntityMapper', () => {
  let mapper: EntityMapper;

  const baseEntity = {
    _id: new Types.ObjectId(),
    latitude: 33.5,
    longitude: 36.3,
    distanceKm: 3.5,
    durationMinutes: 10,
    travelMode: 'driving-car' as const,
    routeAvailable: true,
  };

  beforeEach(() => {
    mapper = new EntityMapper();
  });

  describe('toResponse()', () => {
    describe('doctor entity', () => {
      const doctorEntity = {
        ...baseEntity,
        firstName: 'Ahmad',
        middleName: 'Hassan',
        lastName: 'Ali',
        image: 'profile.jpg',
        publicSpecialization: 'General',
        privateSpecialization: 'Cardiology',
        publicSpecializationId: null,
        privateSpecializationId: null,
      };

      it('returns doctor response with correct entityType', () => {
        const result = mapper.toResponse(doctorEntity, 'doctor');
        expect(result.entityType).toBe('doctor');
      });

      it('maps base fields correctly', () => {
        const result = mapper.toResponse(doctorEntity, 'doctor');
        expect(result.latitude).toBe(33.5);
        expect(result.longitude).toBe(36.3);
        expect(result.distanceKm).toBe(3.5);
        expect(result.durationMinutes).toBe(10);
      });

      it('formats doctor full name', () => {
        const result = mapper.toResponse(doctorEntity, 'doctor') as any;
        expect(result.fullName).toContain('Ahmad');
      });

      it('handles privateSpecializationId as an array of objects', () => {
        const entity = {
          ...doctorEntity,
          privateSpecializationId: [{ name: 'Cardiology' }, { name: 'Neurology' }],
        };
        const result = mapper.toResponse(entity, 'doctor') as any;
        expect(result).toBeDefined();
      });

      it('handles privateSpecializationId as a single object', () => {
        const entity = {
          ...doctorEntity,
          privateSpecializationId: { name: 'Cardiology' },
        };
        const result = mapper.toResponse(entity, 'doctor') as any;
        expect(result).toBeDefined();
      });

      it('handles null privateSpecializationId', () => {
        const entity = { ...doctorEntity, privateSpecializationId: null };
        const result = mapper.toResponse(entity, 'doctor') as any;
        expect(result).toBeDefined();
      });

      it('handles publicSpecializationId as an array', () => {
        const entity = {
          ...doctorEntity,
          publicSpecializationId: [{ name: 'General' }],
        };
        const result = mapper.toResponse(entity, 'doctor') as any;
        expect(result).toBeDefined();
      });
    });

    describe('hospital entity', () => {
      const hospitalEntity = {
        ...baseEntity,
        name: 'Damascus Hospital',
        image: 'hospital.jpg',
        hospitalSpecialization: 'General',
      };

      it('returns hospital response with correct entityType', () => {
        const result = mapper.toResponse(hospitalEntity, 'hospital');
        expect(result.entityType).toBe('hospital');
      });

      it('maps name and specialization', () => {
        const result = mapper.toResponse(hospitalEntity, 'hospital') as any;
        expect(result.name).toBe('Damascus Hospital');
        expect(result.hospitalSpecialization).toBe('General');
      });
    });

    describe('center entity', () => {
      const centerEntity = {
        ...baseEntity,
        name: 'Medical Center A',
        image: 'center.jpg',
        centerSpecialization: 'Cardiology',
      };

      it('returns center response with correct entityType', () => {
        const result = mapper.toResponse(centerEntity, 'center');
        expect(result.entityType).toBe('center');
      });

      it('maps name and specialization', () => {
        const result = mapper.toResponse(centerEntity, 'center') as any;
        expect(result.name).toBe('Medical Center A');
        expect(result.centerSpecialization).toBe('Cardiology');
      });
    });
  });

  describe('toFallback()', () => {
    const entityWithDistance = {
      ...baseEntity,
      firstName: 'Ahmad',
      middleName: null,
      lastName: 'Ali',
      image: null,
      publicSpecialization: 'General',
      privateSpecialization: null,
      publicSpecializationId: null,
      privateSpecializationId: null,
      straightLineDistance: 6.0,
    };

    it('calculates duration based on fallback speed for driving-car', () => {
      const result = mapper.toFallback(
        entityWithDistance,
        'driving-car',
        'doctor',
      ) as any;

      const expectedDuration = Math.round(
        (6.0 / FALLBACK_SPEEDS['driving-car']) * 60,
      );
      expect(result.durationMinutes).toBe(expectedDuration);
    });

    it('sets routeAvailable to false', () => {
      const result = mapper.toFallback(
        entityWithDistance,
        'driving-car',
        'doctor',
      ) as any;
      expect(result.routeAvailable).toBe(false);
    });

    it('rounds distanceKm to 2 decimal places', () => {
      const entity = { ...entityWithDistance, straightLineDistance: 3.14159 };
      const result = mapper.toFallback(entity, 'foot-walking', 'doctor') as any;
      expect(result.distanceKm).toBe(3.14);
    });

    it('uses 0 distance when straightLineDistance is missing', () => {
      const entity = { ...entityWithDistance, straightLineDistance: undefined };
      const result = mapper.toFallback(entity, 'driving-car', 'doctor') as any;
      expect(result.distanceKm).toBe(0);
    });

    it('works for hospital entity type', () => {
      const hospital = {
        ...baseEntity,
        name: 'Hospital A',
        hospitalSpecialization: 'General',
        straightLineDistance: 5.0,
      };
      const result = mapper.toFallback(hospital, 'foot-walking', 'hospital');
      expect(result.entityType).toBe('hospital');
    });
  });
});
