// libs/common/src/helpers/get-lang.helper.ts

import { REQUEST_CONTEXT } from "../context/context";

export type Lang = 'en' | 'ar';

/**
 * Reads the current request language from AsyncLocalStorage context.
 *
 * The language is set once per request by LangMiddleware, which reads
 * the `Accept-Language` header and stores it in REQUEST_CONTEXT.
 *
 * Usage (in controller only — never in service):
 *   const lang = getLang(); // 'en' | 'ar'
 *
 * Falls back to 'en' if:
 *   - Called outside of an HTTP request context
 *   - LangMiddleware was not registered for this route
 *   - Accept-Language header was missing or unrecognized
 */
export function getLang(): Lang {
  const store = REQUEST_CONTEXT.getStore();
  return (store?.get('lang') as Lang) ?? 'en';
}
