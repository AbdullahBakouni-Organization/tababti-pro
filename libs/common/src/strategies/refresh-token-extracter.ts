// refresh-token.extractor.ts
import type { Request } from 'express';

export const refreshTokenFromCookie = (req: Request): string | null => {
  if (!req || !req.cookies) {
    return null;
  }

  return req.cookies['token'] || null; // must match res.cookie('token', ...)
};
