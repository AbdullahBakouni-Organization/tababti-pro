/**
 * One-off migration: drop the legacy unique index that included `status`
 * in its key. The replacement is a partial unique index (see
 * booking.schema.ts) restricted to active statuses, which Mongoose will
 * create automatically once this index is gone.
 *
 * Run once per environment:
 *   ts-node libs/common/src/database/migrations/drop-booking-status-unique-index.ts
 */
import { connect, connection } from 'mongoose';

const LEGACY_INDEX_NAME =
  'doctorId_1_patientId_1_bookingDate_1_bookingTime_1_bookingEndTime_1_status_1_location_1';

async function run(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI env var is required');
  }

  await connect(uri);
  const bookings = connection.collection('bookings');

  const indexes = await bookings.indexes();
  const exists = indexes.some((i) => i.name === LEGACY_INDEX_NAME);

  if (!exists) {
    console.log(`Index ${LEGACY_INDEX_NAME} not present — nothing to drop.`);
  } else {
    await bookings.dropIndex(LEGACY_INDEX_NAME);

    console.log(`Dropped ${LEGACY_INDEX_NAME}.`);
  }

  await connection.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
