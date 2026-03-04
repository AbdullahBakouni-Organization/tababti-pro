// refresh-token.extractor.ts
import type { Request } from 'express';

export const refreshAdminTokenFromCookie = (req: Request): string | null => {
  if (!req || !req.cookies) {
    return null;
  }

  return req.cookies['admin_token'] || null; // must matchmatch.cookie('admin_token', ...)
};
