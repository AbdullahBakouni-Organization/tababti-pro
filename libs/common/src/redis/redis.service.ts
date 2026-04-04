import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import type { RedisModuleOptions } from './redis.module';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor(
    @Inject('REDIS_OPTIONS')
    private readonly options: RedisModuleOptions,
  ) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.options.host,
      port: this.options.port,
      password: this.options.password,
      db: this.options.db || 0,
      keyPrefix: this.options.keyPrefix,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    // Separate connections for pub/sub
    this.subscriber = this.client.duplicate();
    this.publisher = this.client.duplicate();

    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis client error', err);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit();
    await this.publisher.quit();
  }

  // Basic Key-Value Operations
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  // Hash Operations
  async hset(key: string, field: string, value: any): Promise<void> {
    await this.client.hset(key, field, JSON.stringify(value));
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    const value = await this.client.hget(key, field);
    return value ? JSON.parse(value) : null;
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const data = await this.client.hgetall(key);
    const result: Record<string, T> = {};

    for (const [field, value] of Object.entries(data)) {
      result[field] = JSON.parse(value);
    }

    return result;
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }

  // List Operations
  async lpush(key: string, value: any): Promise<void> {
    await this.client.lpush(key, JSON.stringify(value));
  }

  async rpush(key: string, value: any): Promise<void> {
    await this.client.rpush(key, JSON.stringify(value));
  }

  async lpop<T>(key: string): Promise<T | null> {
    const value = await this.client.lpop(key);
    return value ? JSON.parse(value) : null;
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const values = await this.client.lrange(key, start, stop);
    return values.map((v) => JSON.parse(v));
  }

  // Set Operations
  async sadd(key: string, ...members: any[]): Promise<void> {
    const serialized = members.map((m) => JSON.stringify(m));
    await this.client.sadd(key, ...serialized);
  }

  async smembers<T>(key: string): Promise<T[]> {
    const members = await this.client.smembers(key);
    return members.map((m) => JSON.parse(m));
  }

  async sismember(key: string, member: any): Promise<boolean> {
    const result = await this.client.sismember(key, JSON.stringify(member));
    return result === 1;
  }

  async srem(key: string, member: any): Promise<void> {
    await this.client.srem(key, JSON.stringify(member));
  }

  // Sorted Set Operations
  async zadd(key: string, score: number, member: any): Promise<void> {
    await this.client.zadd(key, score, JSON.stringify(member));
  }

  async zrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    const members = await this.client.zrange(key, start, stop);
    return members.map((m) => JSON.parse(m));
  }

  async zrangebyscore<T>(key: string, min: number, max: number): Promise<T[]> {
    const members = await this.client.zrangebyscore(key, min, max);
    return members.map((m) => JSON.parse(m));
  }

  // Pub/Sub Operations
  async publish(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(
    channel: string,
    callback: (message: any) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(channel);

    this.subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        callback(JSON.parse(msg));
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  // Pattern matching
  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async deletePattern(pattern: string): Promise<void> {
    const keys = await this.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  // Increment/Decrement
  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  async decr(key: string): Promise<number> {
    return await this.client.decr(key);
  }

  async incrby(key: string, increment: number): Promise<number> {
    return await this.client.incrby(key, increment);
  }

  // Get raw client for advanced operations
  getClient(): Redis {
    return this.client;
  }
}
