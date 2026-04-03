/**
 * Global teardown — runs once after all integration test suites complete.
 * Individual test files drop their own databases in afterAll hooks.
 * This file is a safety net to drop the probe DB created in global-setup.
 */
import mongoose from 'mongoose';

export default async function globalTeardown() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';

  try {
    const conn = await mongoose.connect(
      `${mongoUri}/tababti_integration_probe`,
      { serverSelectionTimeoutMS: 5_000 },
    );
    await conn.connection.dropDatabase();
    await conn.disconnect();
  } catch {
    // Ignore — probe DB may not exist if global-setup failed
  }
}
