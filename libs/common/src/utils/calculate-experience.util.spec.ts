import { calculateYearsOfExperience } from './calculate-experience.util';

describe('calculateYearsOfExperience', () => {
  it('should return 0 when no startDate is provided', () => {
    expect(calculateYearsOfExperience()).toBe(0);
    expect(calculateYearsOfExperience(undefined)).toBe(0);
  });

  it('should return correct years for a date several years ago', () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    fiveYearsAgo.setMonth(fiveYearsAgo.getMonth() - 1); // ensure past the anniversary

    expect(calculateYearsOfExperience(fiveYearsAgo)).toBe(5);
  });

  it('should return 0 for a date in the current year that has not yet reached 1 year', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 6);

    expect(calculateYearsOfExperience(recent)).toBe(0);
  });

  it('should not count a year if the anniversary month has not yet passed', () => {
    const today = new Date();
    const almostTwoYears = new Date(
      today.getFullYear() - 2,
      today.getMonth() + 1,
      today.getDate(),
    );

    expect(calculateYearsOfExperience(almostTwoYears)).toBe(1);
  });

  it('should return 0 for a future date', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 3);

    expect(calculateYearsOfExperience(future)).toBe(0);
  });

  it('should handle a date exactly on today as 0 years', () => {
    const today = new Date();
    expect(calculateYearsOfExperience(today)).toBe(0);
  });
});
