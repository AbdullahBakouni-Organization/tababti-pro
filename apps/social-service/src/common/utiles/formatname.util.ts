export function formatDoctorName(
  firstName: string,
  middleName?: string,
  lastName?: string,
): string {
  const parts = [firstName];
  if (middleName) parts.push(middleName);
  if (lastName) parts.push(lastName);
  return parts.join(' ');
}
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ًٌٍَُِّْ]/g, '') // remove diacritics
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

export function normalizeEnglish(text: string): string {
  return text
    .toLowerCase()
    .replace(/orthopaedic/g, 'orthopedic')
    .replace(/s$/g, '');
}

export function buildArabicInsensitiveRegex(text: string): RegExp {
  const map: Record<string, string> = {
    // alef variations
    ا: '[اأإآٱ]',
    // ta marbuta / ha
    ة: '[هة]',
    ه: '[هة]',
    // yaa / alef maqsura
    ى: '[ييى]',
    ي: '[ييى]',
    // waw / hamza waw
    و: '[وؤ]',
    // hamza on ya
    ئ: '[ييىئ]',
    // kaf / gaf optional
    ك: '[كگ]',
  };

  const stripped = text
    .replace(/[ًٌٍَُِّْ]/g, '') // remove tashkeel
    .toLowerCase();

  const regexString = stripped
    .split('')
    .map((ch) => map[ch] || ch)
    .join('');

  return new RegExp(regexString, 'i');
}
export function buildSmartRegex(term: string): RegExp {
  // normalize english spelling first
  const englishNorm = normalizeEnglish(term);

  // if contains Arabic letters, use Arabic regex builder
  if (/[\u0600-\u06FF]/.test(englishNorm)) {
    return buildArabicInsensitiveRegex(englishNorm);
  }

  // otherwise fallback to plain case-insensitive regex
  return new RegExp(englishNorm, 'i');
}
