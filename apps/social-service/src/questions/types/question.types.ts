import { ObjectType, Field, Int, ID } from '@nestjs/graphql';

// ── Specialization ─────────────────────────────────────────────────────────────

@ObjectType()
export class SpecializationType {
    @Field(() => ID)
    _id: string;

    @Field({ nullable: true })
    name?: string;

    @Field({ nullable: true })
    nameAr?: string;
}

// ── Asker ──────────────────────────────────────────────────────────────────────

@ObjectType()
export class AskerType {
    @Field({ nullable: true })
    name?: string;

    @Field({ nullable: true })
    image?: string;
}

// ── Answer ─────────────────────────────────────────────────────────────────────

@ObjectType()
export class AnswerType {
    @Field(() => ID)
    _id: string;

    @Field()
    content: string;

    @Field()
    responderName: string;

    @Field({ nullable: true })
    responderImage?: string;

    @Field({ nullable: true })
    answeredAgo?: string;

    @Field({ nullable: true })
    createdAt?: Date;

    /**
     * True when this answer was written by the requesting doctor.
     * Only meaningful in the doctor feed (getDoctorQuestions).
     * Always false in the general feed.
     */
    @Field()
    isMyAnswer: boolean;
}

// ── Question ───────────────────────────────────────────────────────────────────

@ObjectType()
export class QuestionType {
    @Field(() => ID)
    _id: string;

    @Field()
    content: string;

    @Field()
    status: string;

    @Field(() => [SpecializationType])
    specializations: SpecializationType[];

    /**
     * Always = total number of answers on this question,
     * regardless of which filter/feed is active.
     */
    @Field(() => Int)
    answersCount: number;

    /**
     * In the general feed       → all answers
     * filter: all/specialization → all answers (isMyAnswer flags doctor's own)
     * filter: myAnswers          → only the requesting doctor's answer
     */
    @Field(() => [AnswerType])
    answers: AnswerType[];

    @Field(() => AskerType, { nullable: true })
    asker?: AskerType;

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;
}

// ── Paginated result ───────────────────────────────────────────────────────────

@ObjectType()
export class QuestionPageType {
    @Field(() => [QuestionType])
    questions: QuestionType[];

    @Field(() => Int)
    total: number;

    @Field(() => Int)
    page: number;

    @Field(() => Int)
    limit: number;

    @Field(() => Int)
    totalPages: number;
}