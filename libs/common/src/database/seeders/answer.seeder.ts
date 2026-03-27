import { getModelToken } from '@nestjs/mongoose';
import { Answer } from '../schemas/answer.schema';
import { UserRole, AnswerStatus } from '../schemas/common.enums';

export class AnswerSeeder {
  constructor(private app) {}

  async seed(questions) {
    const answerModel = this.app.get(getModelToken(Answer.name));
    const doctorModel = this.app.get(getModelToken('Doctor'));

    await answerModel.deleteMany({});

    const doctors = await doctorModel.find().limit(5);

    const payload: Partial<Answer>[] = [];

    questions.forEach((q, i) => {
      payload.push({
        questionId: q._id,
        responderType: UserRole.DOCTOR,
        responderId: doctors[i % doctors.length]._id,
        content: `هذا رد طبي على السؤال رقم ${i + 1}`,
        status: AnswerStatus.PENDING,
      });
    });

    const created = await answerModel.insertMany(payload);

    console.log(`✅ Seeded ${created.length} answers`);
  }
}
