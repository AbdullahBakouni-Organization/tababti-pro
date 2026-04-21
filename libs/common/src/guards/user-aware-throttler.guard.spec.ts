import { Reflector } from '@nestjs/core';
import { UserAwareThrottlerGuard } from './user-aware-throttler.guard';

// The guard only overrides `getTracker`; the rest of ThrottlerGuard's behavior
// is integration-tested by @nestjs/throttler itself, so we isolate the tracker
// logic here via a thin harness.
describe('UserAwareThrottlerGuard.getTracker', () => {
  let guard: UserAwareThrottlerGuard;

  beforeEach(() => {
    guard = new UserAwareThrottlerGuard(
      { throttlers: [] } as any,
      {} as any,
      new Reflector(),
    );
  });

  const getTracker = (req: Record<string, any>) =>
    (guard as any).getTracker(req) as Promise<string>;

  it('prefers accountId stamped by JwtStrategy', async () => {
    const tracker = await getTracker({
      user: { accountId: 'acc-123', entity: { _id: 'ent-999' } },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('user:acc-123');
  });

  it('falls back to entity._id when accountId is missing', async () => {
    const tracker = await getTracker({
      user: { entity: { _id: 'ent-999' } },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('user:ent-999');
  });

  it('falls back to sub then id', async () => {
    expect(await getTracker({ user: { sub: 's1' }, ip: '1.2.3.4' })).toBe(
      'user:s1',
    );
    expect(await getTracker({ user: { id: 'u9' }, ip: '1.2.3.4' })).toBe(
      'user:u9',
    );
  });

  it('uses IP with ip: prefix for unauthenticated requests', async () => {
    expect(await getTracker({ ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
  });

  it('falls back to ips[0] when req.ip is missing (trust-proxy chain)', async () => {
    expect(await getTracker({ ips: ['198.51.100.2', '10.0.0.1'] })).toBe(
      'ip:198.51.100.2',
    );
  });

  it('returns ip:unknown when neither user nor ip present', async () => {
    expect(await getTracker({})).toBe('ip:unknown');
  });

  it('does not mix user and ip buckets — same IP, different users get distinct trackers', async () => {
    const a = await getTracker({
      user: { accountId: 'userA' },
      ip: '10.0.0.1',
    });
    const b = await getTracker({
      user: { accountId: 'userB' },
      ip: '10.0.0.1',
    });
    expect(a).not.toBe(b);
  });

  it('does not leak a pre-login ip bucket into a post-login user bucket', async () => {
    const preLogin = await getTracker({ ip: '10.0.0.1' });
    const postLogin = await getTracker({
      user: { accountId: 'acc-1' },
      ip: '10.0.0.1',
    });
    expect(preLogin).toBe('ip:10.0.0.1');
    expect(postLogin).toBe('user:acc-1');
    expect(preLogin).not.toBe(postLogin);
  });
});
