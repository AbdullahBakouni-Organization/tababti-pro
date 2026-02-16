import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../schemas/user.schema';
import { ApprovalStatus, City, Gender } from '../schemas/common.enums';

export class UserSeeder {
    constructor(private app) { }

    async seed() {
        const userModel = this.app.get(getModelToken(User.name));

        // Clear existing users
        await userModel.deleteMany({});

        // Example users data
        const usersData: Partial<User>[] = [
            {
                authAccountId: new Types.ObjectId(),
                username: 'Ahmad',
                phone: '+963912345678',
                gender: Gender.MALE,
                city: City.Damascus,
                DataofBirth: new Date('1990-01-01'),
                status: ApprovalStatus.APPROVED,
            },
            {
                authAccountId: new Types.ObjectId(),
                username: 'Sara',
                phone: '+963912345679',
                gender: Gender.FEMALE,
                city: City.Aleppo,
                DataofBirth: new Date('1992-05-15'),
                status: ApprovalStatus.APPROVED,
            },
            {
                authAccountId: new Types.ObjectId(),
                username: 'Khaled',
                phone: '+963912345680',
                gender: Gender.MALE,
                city: City.Homs,
                DataofBirth: new Date('1985-08-10'),
                status: ApprovalStatus.APPROVED,
            },
            {
                authAccountId: new Types.ObjectId(),
                username: 'Lina',
                phone: '+963912345681',
                gender: Gender.FEMALE,
                city: City.Latakia,
                DataofBirth: new Date('1995-12-20'),
                status: ApprovalStatus.APPROVED,
            },
            {
                authAccountId: new Types.ObjectId(),
                username: 'Omar',
                phone: '+963912345682',
                gender: Gender.MALE,
                city: City.RifDimashq,
                DataofBirth: new Date('1988-03-03'),
                status: ApprovalStatus.APPROVED,
            },
        ];

        const created = await userModel.insertMany(usersData);
        console.log(`✅ Seeded ${created.length} users`);

        return created; // can be used for questions/answers
    }
}
