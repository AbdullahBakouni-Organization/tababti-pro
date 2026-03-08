// request-context.ts
import { AsyncLocalStorage } from 'async_hooks';

export const REQUEST_CONTEXT = new AsyncLocalStorage<Map<string, unknown>>();
