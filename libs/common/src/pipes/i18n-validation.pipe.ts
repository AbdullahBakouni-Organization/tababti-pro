// libs/common/src/pipes/i18n-validation.pipe.ts
import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { REQUEST_CONTEXT } from '../context/request-context';

type Lang = 'en' | 'ar';

// ─── Translation map ──────────────────────────────────────────────────────────
// Two types of entries:
//   1. Exact keys  (e.g. 'field.OTP_LENGTH')  — matched first, exact string
//   2. Fragments   (e.g. 'should not be empty') — matched as substring fallback
//
// Always add new DTO custom messages here as exact keys.
// ─────────────────────────────────────────────────────────────────────────────
const EXACT_KEYS: Record<string, Record<Lang, string>> = {
  // ── field keys used in DTOs ───────────────────────────────────────────────
  'field.REQUIRED': {
    en: 'This field is required',
    ar: 'هذا الحقل مطلوب',
  },
  'field.MUST_BE_STRING': {
    en: 'This field must be a string',
    ar: 'يجب أن يكون هذا الحقل نصاً',
  },
  'field.INVALID_VALUE': {
    en: 'Invalid value provided',
    ar: 'القيمة المدخلة غير صالحة',
  },
  'field.TOO_LONG': {
    en: 'Value is too long',
    ar: 'القيمة طويلة جداً',
  },
  'field.TOO_SHORT': {
    en: 'Value is too short',
    ar: 'القيمة قصيرة جداً',
  },
  'field.INVALID_DATE': {
    en: 'Invalid date format',
    ar: 'صيغة التاريخ غير صالحة',
  },
  'field.OTP_LENGTH': {
    en: 'OTP must be exactly 6 digits',
    ar: 'رمز التحقق يجب أن يكون 6 أرقام بالضبط',
  },
  'field.INVALID_EMAIL': {
    en: 'Invalid email address',
    ar: 'عنوان البريد الإلكتروني غير صالح',
  },
  'field.MUST_BE_NUMBER': {
    en: 'This field must be a number',
    ar: 'يجب أن يكون هذا الحقل رقماً',
  },

  // ── custom messages written directly in DTO decorators ────────────────────
  'Phone number must be a valid Syrian phone number': {
    en: 'Phone number must be a valid Syrian phone number',
    ar: 'رقم الهاتف يجب أن يكون رقماً سورياً صحيحاً',
  },
  'Username contains invalid characters': {
    en: 'Username contains invalid characters',
    ar: 'اسم المستخدم يحتوي على أحرف غير مسموح بها',
  },
  'Invalid date': {
    en: 'Invalid date',
    ar: 'تاريخ غير صالح',
  },
};

// Fragment fallback — matches class-validator built-in messages by substring
const FRAGMENT_MAP: Record<string, Record<Lang, string>> = {
  'should not be empty': {
    en: 'This field is required',
    ar: 'هذا الحقل مطلوب',
  },
  'must be a string': {
    en: 'This field must be a string',
    ar: 'يجب أن يكون هذا الحقل نصاً',
  },
  'must be one of the following values': {
    en: 'Invalid value provided',
    ar: 'القيمة المدخلة غير صالحة',
  },
  'must be longer than or equal': {
    en: 'Value is too short',
    ar: 'القيمة قصيرة جداً',
  },
  'must be shorter than or equal': {
    en: 'Value is too long',
    ar: 'القيمة طويلة جداً',
  },
  'must be a valid date': {
    en: 'Invalid date format',
    ar: 'صيغة التاريخ غير صالحة',
  },
  'must be a number': {
    en: 'This field must be a number',
    ar: 'يجب أن يكون هذا الحقل رقماً',
  },
  'must be an email': {
    en: 'Invalid email address',
    ar: 'عنوان البريد الإلكتروني غير صالح',
  },
  'must be exactly': {
    en: 'Invalid length',
    ar: 'الطول غير صالح',
  },
};

function translateMessage(message: string, lang: Lang): string {
  // 1. Exact match first (covers all field.* keys and custom DTO messages)
  if (EXACT_KEYS[message]) {
    return EXACT_KEYS[message][lang];
  }
  // 2. Substring fallback (covers class-validator built-in messages)
  for (const [fragment, translations] of Object.entries(FRAGMENT_MAP)) {
    if (message.toLowerCase().includes(fragment.toLowerCase())) {
      return translations[lang];
    }
  }
  // 3. Last resort — return as-is (never a raw key if DTOs use field.* keys)
  return message;
}

@Injectable()
export class I18nValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const lang: Lang =
      (REQUEST_CONTEXT.getStore()?.get('lang') as Lang) ?? 'en';

    const object = plainToInstance(metatype, value);
    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const messages = errors.flatMap((err) =>
        Object.values(err.constraints ?? {}).map((msg) =>
          translateMessage(msg, lang),
        ),
      );
      throw new BadRequestException(messages);
    }

    return object;
  }

  private toValidate(metatype: any): boolean {
    const types: any[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
