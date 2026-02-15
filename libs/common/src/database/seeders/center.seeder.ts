import 'dotenv/config';
import { Injectable } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { faker } from '@faker-js/faker';

import { Center } from '../schemas/center.schema';
import { AuthAccount } from '../schemas/auth.schema';
import { Cities } from '../schemas/cities.schema';
import {
  UserRole,
  ApprovalStatus,
  CenterSpecialization,
} from '../schemas/common.enums';

@Injectable()
export class CenterSeeder {
  constructor(private app) {}

  async seed() {
    const app = await NestFactory.createApplicationContext(DatabaseModule);

    const centerModel = app.get<Model<Center>>(getModelToken('Center'));
    const authModel = app.get<Model<AuthAccount>>(getModelToken('AuthAccount'));
    const cityModel = app.get<Model<Cities>>(getModelToken('Cities'));

    // تنظيف المراكز القديمة
    await centerModel.deleteMany({});

    const cities = await cityModel.find();
    if (!cities.length)
      throw new Error('❌ No cities found. Seed cities first.');

    function generateSyrianPhone(): string {
      return '+9639' + faker.string.numeric(8);
    }

    const specializationKeys = Object.keys(CenterSpecialization);

    // إنشاء 20 مركزًا كمثال
    for (let i = 0; i < 20; i++) {
      const city = cities[Math.floor(Math.random() * cities.length)];
      const randomSpecKey = specializationKeys[
        Math.floor(Math.random() * specializationKeys.length)
      ] as keyof typeof CenterSpecialization;
      const specialization = CenterSpecialization[randomSpecKey];

      // إنشاء AuthAccount لكل مركز
      const authAccount = await authModel.create({
        phones: [generateSyrianPhone()],
        role: UserRole.CENTER,
        isActive: true,
      });

      // إنشاء المركز بالكامل
      const center = await centerModel.create({
        authAccountId: authAccount._id,
        name: `مركز ${specialization} ${faker.person.firstName()}`,
        address: faker.location.streetAddress(),
        bio: '', // نص قصير ومتوافق مع Regex
        cityId: city._id,
        phones: [
          {
            normal: [generateSyrianPhone()],
            clinic: [],
            whatsup: [],
            emergency: [],
          },
        ],
        centerSpecialization: specialization,
        latitude: 33 + Math.random(),
        longitude: 36 + Math.random(),
        rating: Math.floor(Math.random() * 5) + 1,
        workingHours: [
          { day: 'monday', from: '09:00', to: '17:00' },
          { day: 'tuesday', from: '09:00', to: '17:00' },
        ],
        approvalStatus: ApprovalStatus.APPROVED,
        subscriptionId: undefined,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0,
        image: faker.image.url(), // حقل نصي مفرد
        certificateImage: faker.image.url(),
        licenseImages: faker.image.url(), // حقل نصي مفرد
      });

      console.log(`✅ Center created: ${center.name} in city ${city.name}`);
    }

    console.log('\n🎉 All centers seeded successfully!');
    await app.close();
  }
}
