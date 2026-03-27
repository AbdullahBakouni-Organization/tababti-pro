import { getModelToken } from '@nestjs/mongoose';
import { Question } from '../schemas/question.schema';
import { QuestionStatus } from '../schemas/common.enums';

export class QuestionSeeder {
  constructor(private app) {}

  async seed() {
    const questionModel = this.app.get(getModelToken(Question.name));
    const userModel = this.app.get(getModelToken('User'));
    const specModel = this.app.get(getModelToken('PrivateSpecialization'));

    await questionModel.deleteMany({});

    const users = await userModel.find().limit(5);
    const specs = await specModel.find().limit(5);

    // ⭐⭐⭐ FIX
    const payload: Partial<Question>[] = [];

    for (let i = 0; i < 10; i++) {
      payload.push({
        userId: users[i % users.length]._id,
        content: `سؤال طبي تجريبي رقم ${i + 1}`,
        specializationId: specs[i % specs.length]._id as any,
        status: QuestionStatus.PENDING,
      });
    }

    const created = await questionModel.insertMany(payload);

    console.log(`✅ Seeded ${created.length} questions`);

    return created; // مهم لاستخدامها في answers
  }
}
