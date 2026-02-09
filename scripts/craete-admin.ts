// scripts/create-admin.ts
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../libs/common/src/database/database.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin } from '../libs/common/src/database/schemas/admin.schema';
import { AuthAccount } from '../libs/common/src/database/schemas/auth.schema';
import { UserRole } from '../libs/common/src/database/schemas/common.enums';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(DatabaseModule);

  const adminModel = app.get<Model<Admin>>(getModelToken(Admin.name));
  const authAccountModel = app.get<Model<AuthAccount>>(
    getModelToken(AuthAccount.name),
  );

  const adminPhone = '+963968679572'; // Change this
  const adminUsername = 'admin'; // Change this
  const adminPassword = 'admin123'; // Change this

  // Check if admin already exists
  const existingAdmin = await adminModel.findOne({
    $or: [{ username: adminUsername }, { phone: adminPhone }],
  });

  if (existingAdmin) {
    console.log('Admin already exists');
    await app.close();
    return;
  }

  // Create AuthAccount for admin
  const authAccount = await authAccountModel.create({
    phones: [adminPhone],
    role: UserRole.ADMIN,
    isActive: true,
  });

  // Create Admin
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await adminModel.create({
    authAccountId: authAccount._id,
    username: adminUsername,
    phone: adminPhone,
    password: hashedPassword,
    isActive: true,
  });

  console.log('Admin created successfully');
  console.log('Username:', adminUsername);
  console.log('Phone:', adminPhone);
  console.log('Password:', adminPassword);

  await app.close();
}

bootstrap();
