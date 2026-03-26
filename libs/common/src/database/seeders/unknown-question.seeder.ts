import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { DatabaseModule } from '../database.module';

// ---------------------------------------------------------
// Seeder
// ---------------------------------------------------------
class UnknownQuestionSeeder {
  async seed() {
    console.log('❓ Seeding Unknown Question...\n');

    const app = await NestFactory.createApplicationContext(DatabaseModule);

    try {
      const UnknownQuestionModel = app.get(getModelToken('UnknownQuestion'));

      // Optional: prevent duplicates
      const exists = await UnknownQuestionModel.findOne({
        name: 'لا أعلم',
      });

      if (exists) {
        console.log('⚠️ Value already exists, skipping...');
        return;
      }

      // Insert value
      await UnknownQuestionModel.create({
        name: 'لا أعلم',
      });

      console.log('✅ Inserted: لا أعلم');
    } catch (error) {
      console.error('❌ Seeder failed:', error);
    } finally {
      await app.close();
    }
  }
}

// ---------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------
async function bootstrap() {
  const seeder = new UnknownQuestionSeeder();
  await seeder.seed();
}

bootstrap()
  .then(() => {
    console.log('✅ Seeder finished');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Seeder crashed:', err);
    process.exit(1);
  });
