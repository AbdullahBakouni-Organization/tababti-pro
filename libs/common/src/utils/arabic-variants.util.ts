// src/common/utils/arabic-variants.utils.ts

/**
 * Arabic Text Variants Generator
 * Generates all possible variations of Arabic text for search matching
 *
 * Handles:
 * - Diacritics removal (تشكيل)
 * - Alif normalization (أ إ آ ٱ → ا)
 * - Ya/Alif Maqsura (ي ↔ ى)
 * - Taa Marbuta (ة ↔ ه)
 * - Hamza variations (ؤ → و, ئ → ي)
 * - Definite article (ال)
 * - Common prefixes (و)
 * - Letter doubling (تشديد)
 */

export class ArabicVariantsUtils {
  /**
   * Generate all variants of an Arabic word
   *
   * @example
   * getArabicVariants('محمد')
   * // Returns: ['محمد', 'مُحمّد', 'مُحَمَّد', 'محمّد', 'ومحمد', 'المحمد']
   *
   * @example
   * getArabicVariants('علي')
   * // Returns: ['علي', 'عليّ', 'على', 'عَلِي', 'وعلي']
   */
  static getArabicVariants(text: string): string[] {
    if (!text || text.trim().length < 2) {
      return [];
    }

    const variants = new Set<string>();

    // 1. Original text
    variants.add(text);
    variants.add(text.trim());

    // 2. Remove all diacritics (تشكيل)
    const noDiacritics = this.removeDiacritics(text);
    variants.add(noDiacritics);

    // 3. Normalize Alif (أ إ آ ٱ → ا)
    const normalized = this.normalizeAlif(noDiacritics);
    variants.add(normalized);

    // 4. Ya/Alif Maqsura variations (ي ↔ ى)
    if (normalized.includes('ي')) {
      variants.add(normalized.replace(/ي/g, 'ى'));
    }
    if (normalized.includes('ى')) {
      variants.add(normalized.replace(/ى/g, 'ي'));
    }

    // 5. Taa Marbuta variations (ة ↔ ه)
    if (normalized.endsWith('ة')) {
      variants.add(normalized.slice(0, -1) + 'ه');
    }
    if (normalized.endsWith('ه')) {
      variants.add(normalized.slice(0, -1) + 'ة');
    }

    // 6. Hamza on Waw/Ya (ؤ → و, ئ → ي)
    if (normalized.includes('ؤ')) {
      variants.add(normalized.replace(/ؤ/g, 'و'));
    }
    if (normalized.includes('ئ')) {
      variants.add(normalized.replace(/ئ/g, 'ي'));
    }

    // 7. Initial Alif with Hamza variations
    if (normalized.startsWith('ا')) {
      const base = normalized.slice(1);
      variants.add('أ' + base);
      variants.add('إ' + base);
      variants.add('آ' + base);
    }

    // 8. Add 'و' prefix (وعلي ← علي)
    if (!normalized.startsWith('و')) {
      variants.add('و' + normalized);
      variants.add('وال' + normalized);
    } else {
      // Remove 'و' prefix
      variants.add(normalized.slice(1));
    }

    // 9. Definite article 'ال' variations
    if (!normalized.startsWith('ال')) {
      variants.add('ال' + normalized);
    } else {
      // Remove 'ال'
      variants.add(normalized.slice(2));
    }

    // 10. Letter doubling variations (تشديد)
    // Remove doubled letters
    for (let i = 0; i < normalized.length - 1; i++) {
      if (normalized[i] === normalized[i + 1]) {
        const withoutDouble = normalized.slice(0, i) + normalized.slice(i + 1);
        variants.add(withoutDouble);
      }
    }

    // 11. Add common name-specific variants
    this.addCommonNameVariants(normalized, variants);

    // 12. Clean and filter
    const finalVariants = Array.from(variants)
      .map((v) => v.trim())
      .filter((v) => v && v.length >= 2);

    // Remove duplicates
    return [...new Set(finalVariants)];
  }

  /**
   * Remove all Arabic diacritics (تشكيل)
   */
  private static removeDiacritics(text: string): string {
    // Remove diacritics: ً ٌ ٍ َ ُ ِ ّ ْ
    return text.replace(/[\u064B-\u065F]/g, '');
  }

  /**
   * Normalize Alif variations to standard Alif
   */
  private static normalizeAlif(text: string): string {
    // أ إ آ ٱ → ا
    return text.replace(/[أإآٱ]/g, 'ا');
  }

  /**
   * Add variants for common Arabic names
   */
  private static addCommonNameVariants(
    text: string,
    variants: Set<string>,
  ): void {
    const namePatterns: Record<string, string[]> = {
      محمد: ['مُحمّد', 'مُحَمَّد', 'محمّد', 'مُحَمَد'],
      احمد: ['أحمد', 'اَحمد', 'أَحْمَد'],
      علي: ['عليّ', 'على', 'عَلِي', 'عَلِيّ'],
      حسن: ['حَسَن', 'حَسّان'],
      حسين: ['حُسين', 'حَسَين'],
      خالد: ['خَالِد', 'خَالد'],
      عمر: ['عُمر', 'عَمر'],
      فاطمة: ['فاطِمة', 'فاطمه'],
      عائشة: ['عايشة', 'عائشه'],
      خديجة: ['خديجه'],
      مريم: ['مَريم', 'مَرْيَم'],
    };

    const normalized = text.toLowerCase();
    if (namePatterns[normalized]) {
      namePatterns[normalized].forEach((variant) => variants.add(variant));
    }
  }

  /**
   * Check if text contains Arabic characters
   */
  static isArabic(text: string): boolean {
    return /[\u0600-\u06FF]/.test(text);
  }

  /**
   * Get comprehensive variants for search
   * Combines Arabic variants with basic variants
   */
  static getSearchVariants(text: string): string[] {
    const variants = new Set<string>();

    // Add original
    variants.add(text);
    variants.add(text.toLowerCase());

    // If Arabic, get Arabic variants
    if (this.isArabic(text)) {
      const arabicVariants = this.getArabicVariants(text);
      arabicVariants.forEach((v) => variants.add(v));
    }

    return Array.from(variants).filter((v) => v && v.length >= 2);
  }
}

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Simple usage
const variants = ArabicVariantsUtils.getArabicVariants('محمد');
console.log(variants);
// Output: ['محمد', 'مُحمّد', 'مُحَمَّد', 'ومحمد', 'المحمد', ...]

// Example 2: In search service
class SearchService {
  private getSearchVariants(searchTerm: string): string[] {
    if (ArabicVariantsUtils.isArabic(searchTerm)) {
      // Arabic text - use Arabic variants
      return ArabicVariantsUtils.getArabicVariants(searchTerm);
    } else {
      // English text - return basic variants
      return [searchTerm, searchTerm.toLowerCase()];
    }
  }
}

// Example 3: Testing
const testCases = [
  'علي',      // → ['علي', 'عليّ', 'على', 'وعلي', ...]
  'محمد',     // → ['محمد', 'مُحمّد', 'ومحمد', ...]
  'قلب',      // → ['قلب', 'قَلب', 'وقلب', 'القلب', ...]
  'فاطمة',    // → ['فاطمة', 'فاطمه', 'فاطِمة', ...]
];

testCases.forEach(text => {
  const variants = ArabicVariantsUtils.getArabicVariants(text);
  console.log(`${text} →`, variants);
});
*/
