/**
 * Global setup — runs once before all integration test suites.
 * Verifies that MongoDB and Redis are reachable so tests fail fast
 * with a clear error rather than timing out inside individual suites.
 */
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { buildMongoUri } from '../fixtures';

export default async function globalSetup() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  // --- MongoDB connectivity probe ---
  const conn = await mongoose.connect(
    buildMongoUri(mongoUri, 'tababti_integration_probe'),
    { serverSelectionTimeoutMS: 10_000 },
  );
  await conn.connection.db!.command({ ping: 1 });
  await conn.disconnect();

  // --- Redis connectivity probe ---
  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    connectTimeout: 10_000,
    lazyConnect: true,
  });
  await redis.connect();
  await redis.ping();
  await redis.quit();
}
