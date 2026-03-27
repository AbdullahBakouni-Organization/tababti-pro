import { getModelToken } from '@nestjs/mongoose';
import { Post } from '../schemas/post.schema';
import {
  PostStatus,
  SubscriptionPlanType,
  UserRole,
} from '../schemas/common.enums';

import { Types } from 'mongoose';

type PostSeed = {
  authorType: UserRole;
  authorId: Types.ObjectId;
  content?: string;
  images?: string[];
  status: PostStatus;
  subscriptionType: SubscriptionPlanType;
  usageCount: number;
};

export class PostSeeder {
  constructor(private app) {}

  async seed() {
    const postModel = this.app.get(getModelToken(Post.name));
    const doctorModel = this.app.get(getModelToken('Doctor'));
    const userModel = this.app.get(getModelToken('User'));

    await postModel.deleteMany({});

    const doctors = await doctorModel.find().limit(5);
    const users = await userModel.find().limit(5);

    const payload: PostSeed[] = [];

    // =====================================
    // Doctor posts
    // =====================================
    doctors.forEach((d, i) => {
      payload.push({
        authorType: UserRole.DOCTOR,
        authorId: d._id as Types.ObjectId,
        content: `نصيحة طبية رقم ${i + 1}`,
        images: [],
        status: PostStatus.PUBLISHED,
        subscriptionType: SubscriptionPlanType.YEARLY_TIER_1,
        usageCount: Math.floor(Math.random() * 100),
      });
    });

    // =====================================
    // User posts
    // =====================================
    users.forEach((u, i) => {
      payload.push({
        authorType: UserRole.USER,
        authorId: u._id as Types.ObjectId,
        content: `تجربتي الصحية رقم ${i + 1}`,
        images: [],
        status: PostStatus.PUBLISHED,
        subscriptionType: SubscriptionPlanType.YEARLY_TIER_1,
        usageCount: Math.floor(Math.random() * 50),
      });
    });

    const created = await postModel.insertMany(payload);

    console.log(`✅ Seeded ${created.length} posts`);
  }
}
