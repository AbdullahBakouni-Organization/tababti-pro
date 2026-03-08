// lang.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { REQUEST_CONTEXT } from '../context/request-context';

@Injectable()
export class LangMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const lang = req.headers['accept-language'] === 'ar' ? 'ar' : 'en';
    const store = new Map<string, unknown>();
    store.set('lang', lang);
    REQUEST_CONTEXT.run(store, () => next());
  }
}
