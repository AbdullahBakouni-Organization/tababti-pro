import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard that prefers the authenticated user identifier over the
 * client IP. This prevents users behind shared NAT / CGNAT / corporate proxies
 * from sharing a single rate-limit counter (the default ThrottlerGuard is
 * keyed by `req.ip` only).
 *
 * Precedence:
 *   1. `req.user.accountId`  — stamped by JwtStrategy/JwtUserStrategy.validate()
 *   2. `req.user.entity._id` — full entity document id (doctor/admin/user)
 *   3. `req.user.sub`        — raw JWT subject
 *   4. `req.user.id`         — generic fallback
 *   5. `req.ip`              — unauthenticated requests (OTP, login, refresh)
 *
 * Tracker keys are prefixed (`user:` / `ip:`) so that a request arriving on
 * the same IP before and after login does not inherit the pre-login bucket.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const user = req?.user;
    if (user) {
      const id = user.accountId ?? user.entity?._id ?? user.sub ?? user.id;
      if (id) return Promise.resolve(`user:${String(id)}`);
    }

    const ip = req?.ip || req?.ips?.[0] || 'unknown';
    return Promise.resolve(`ip:${ip}`);
  }
}
