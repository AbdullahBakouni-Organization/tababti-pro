import {
  formatDoctorName,
  normalizeArabic,
  normalizeEnglish,
  buildArabicInsensitiveRegex,
  buildSmartRegex,
} from './formatname.util';

describe('formatDoctorName', () => {
  it('should return first name only when no middle or last name', () => {
    expect(formatDoctorName('Ahmed')).toBe('Ahmed');
  });

  it('should join first and last name', () => {
    expect(formatDoctorName('Ahmed', undefined, 'Ali')).toBe('Ahmed Ali');
  });

  it('should join first, middle, and last name', () => {
    expect(formatDoctorName('Ahmed', 'Hassan', 'Ali')).toBe(
      'Ahmed Hassan Ali',
    );
  });

  it('should skip empty middle name', () => {
    expect(formatDoctorName('Ahmed', '', 'Ali')).toBe('Ahmed Ali');
  });
});

describe('normalizeArabic', () => {
  it('should remove diacritics', () => {
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد');
  });

  it('should normalize alef variants to plain alef', () => {
    expect(normalizeArabic('أحمد')).toBe('احمد');
    expect(normalizeArabic('إسلام')).toBe('اسلام');
    expect(normalizeArabic('آمنة')).toBe('امنه');
  });

  it('should normalize alef maqsura to ya', () => {
    expect(normalizeArabic('مستشفى')).toBe('مستشفي');
  });

  it('should normalize ta marbuta to ha', () => {
    expect(normalizeArabic('جامعة')).toBe('جامعه');
  });

  it('should lowercase latin characters mixed in', () => {
    expect(normalizeArabic('Test')).toBe('test');
  });
});

describe('normalizeEnglish', () => {
  it('should lowercase text', () => {
    expect(normalizeEnglish('Cardiology')).toBe('cardiology');
  });

  it('should normalize orthopaedic to orthopedic', () => {
    expect(normalizeEnglish('Orthopaedic')).toBe('orthopedic');
  });

  it('should strip trailing s', () => {
    expect(normalizeEnglish('doctors')).toBe('doctor');
  });

  it('should handle combined normalization', () => {
    expect(normalizeEnglish('Orthopaedics')).toBe('orthopedic');
  });
});

describe('buildArabicInsensitiveRegex', () => {
  it('should match alef variants', () => {
    const regex = buildArabicInsensitiveRegex('احمد');
    expect(regex.test('أحمد')).toBe(true);
    expect(regex.test('إحمد')).toBe(true);
    expect(regex.test('احمد')).toBe(true);
  });

  it('should match ta marbuta and ha interchangeably', () => {
    const regex = buildArabicInsensitiveRegex('جامعه');
    expect(regex.test('جامعة')).toBe(true);
    expect(regex.test('جامعه')).toBe(true);
  });

  it('should strip diacritics before building regex', () => {
    const regex = buildArabicInsensitiveRegex('مُحمّد');
    expect(regex.test('محمد')).toBe(true);
  });

  it('should be case insensitive', () => {
    const regex = buildArabicInsensitiveRegex('test');
    expect(regex.flags).toContain('i');
  });
});

describe('buildSmartRegex', () => {
  it('should use Arabic regex for Arabic text', () => {
    const regex = buildSmartRegex('احمد');
    expect(regex.test('أحمد')).toBe(true);
  });

  it('should use case-insensitive regex for English text', () => {
    const regex = buildSmartRegex('cardiology');
    expect(regex.test('Cardiology')).toBe(true);
    expect(regex.test('CARDIOLOGY')).toBe(true);
  });

  it('should normalize orthopaedic before building regex', () => {
    const regex = buildSmartRegex('Orthopaedic');
    expect(regex.test('orthopedic')).toBe(true);
  });
});
