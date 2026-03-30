import { calculateDistanceKm } from './distance.util';

describe('calculateDistanceKm', () => {
  it('should return 0 for identical coordinates', () => {
    expect(calculateDistanceKm(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it('should calculate distance between New York and Los Angeles approximately', () => {
    // NYC: 40.7128, -74.0060  LA: 34.0522, -118.2437
    const distance = calculateDistanceKm(40.7128, -74.006, 34.0522, -118.2437);
    // known distance is ~3944 km
    expect(distance).toBeGreaterThan(3900);
    expect(distance).toBeLessThan(4000);
  });

  it('should calculate distance between London and Paris approximately', () => {
    // London: 51.5074, -0.1278  Paris: 48.8566, 2.3522
    const distance = calculateDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    // known distance is ~343 km
    expect(distance).toBeGreaterThan(330);
    expect(distance).toBeLessThan(360);
  });

  it('should be symmetric (A to B equals B to A)', () => {
    const d1 = calculateDistanceKm(33.3152, 44.3661, 36.1901, 44.0091);
    const d2 = calculateDistanceKm(36.1901, 44.0091, 33.3152, 44.3661);
    expect(d1).toBeCloseTo(d2, 10);
  });

  it('should handle equator to pole distance', () => {
    // Equator (0,0) to North Pole (90,0) ~ 10008 km
    const distance = calculateDistanceKm(0, 0, 90, 0);
    expect(distance).toBeGreaterThan(9900);
    expect(distance).toBeLessThan(10100);
  });

  it('should handle antipodal points', () => {
    // (0,0) to (0,180) ~ 20015 km (half circumference)
    const distance = calculateDistanceKm(0, 0, 0, 180);
    expect(distance).toBeGreaterThan(19900);
    expect(distance).toBeLessThan(20100);
  });
});
