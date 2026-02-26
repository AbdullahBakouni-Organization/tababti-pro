import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { DatabaseModule } from '../database.module';
import { Admin } from '../schemas/admin.schema';
import { AuthAccount } from '../schemas/auth.schema';
import { UserRole } from '../schemas/common.enums';

async function runAdminSeeder() {
  console.log('🌱 Starting Admin Seeder...\n');

  const app = await NestFactory.createApplicationContext(DatabaseModule);

  const adminModel = app.get<Model<Admin>>(getModelToken(Admin.name));
  const authModel = app.get<Model<AuthAccount>>(
    getModelToken(AuthAccount.name),
  );

  await adminModel.deleteMany({});
  console.log('🗑️  Cleared existing admins');

  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  const authAccount = await authModel.create({
    phones: ['+963999999999'],
    role: UserRole.ADMIN,
    isActive: true,
  });

  const admin = await adminModel.create({
    authAccountId: authAccount._id,
    username: 'superadmin',
    password: hashedPassword,
    phone: '+963938144669',
    isActive: true,
    maxSessions: 5,
    failedLoginAttempts: 0,
  });

  console.log('\n✅ Admin Created Successfully:');
  console.log('Username:', admin.username);
  console.log('Phone:', admin.phone);
  console.log('Password: Admin@123');
  console.log('\n🎉 Admin Seeder Finished');

  await app.close();
}

runAdminSeeder();
