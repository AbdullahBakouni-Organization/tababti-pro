import * as dotenv from 'dotenv';
dotenv.config();

import { Types } from 'mongoose';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { DatabaseModule } from '../database.module';
import { AuthAccount } from '../schemas/auth.schema';
import { Doctor } from '../schemas/doctor.schema';
import { Hospital } from '../schemas/hospital.schema';
import { Center } from '../schemas/center.schema';
import { User } from '../schemas/user.schema';
import { Otp } from '../schemas/otp.schema';
import { PublicSpecialization } from '../schemas/publicspecializations.schema';
import { PrivateSpecialization } from '../schemas/privatespecializations.schema';
import {
    GeneralSpecialty,
    PrivateMedicineSpecialty,
    UserRole,
    ApprovalStatus,
    CenterSpecialization,
    HospitalCategory,
    HospitalSpecialization,
    HospitalStatus,
    Gender,
    City,
} from '../schemas/common.enums';

const privateDocs: (typeof PrivateSpecialization & { _id: Types.ObjectId })[] = [];

// Helper for Syrian phone numbers
function formatPhone(i: number) {
    return '+9639' + (10000000 + i).toString().slice(-8);
}

// Random date of birth
function randomDOB() {
    const year = Math.floor(Math.random() * 40) + 1960;
    const month = Math.floor(Math.random() * 12);
    const day = Math.floor(Math.random() * 28) + 1;
    return new Date(year, month, day);
}

// بيانات المستشفيات التجريبية
const hospitalsData = [

    {
        name: "حرستا الوطني",
        address: "حرستا موقف الانتاج",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["5329816"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.55580796430709,
        longitude: 36.363004370009634,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0,
    },
    {
        name: "القطيفة",
        address: "القطيفة",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["7755202"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.724927553818596,
        longitude: 36.58632875719984,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0,
    },
    {
        name: "مشفى التل الوطني",
        address: "التل الشارع الرئيسي",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["5919950"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.61637340602743,
        longitude: 36.3085159950839,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0,
    },
    {
        name: "مشفى أمية",
        address: "دمشق - الميسات",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["2776204", "2741181", "2762917"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.529286004865895,
        longitude: 36.29280663005931,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0,
    },
    {
        name: "مشفى الأمل",
        address: "دمشق - شارع بغداد أزبكية",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["4451335", "4451334", "4451321"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.52055957753476,
        longitude: 36.301034360044596,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0,
    },
    {
        name: "مشفى الأماني",
        address: "دمشق - مزرعة خلف الهيئة العامة للضرائب و الرسوم - شارع زكي الارسوزي",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["4454351", "4459685", "4451176"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.522573606908324,
        longitude: 36.29520623189591,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0,
    },
    {
        name: "مشفى الأهلي التخصصي",
        address: "دمشق - شارع فارس الخوري جانب جامع الحمزة و العباس",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["4465054", "4465058", "4465059"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.5258272866374,
        longitude: 36.318853250477346,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى القديس لويس",
        address: "دمشق - القصاع",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["4440460", "4440461", "4450705"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.51863661988217,
        longitude: 36.31612140478465,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "المركز الطبي الحديث ( هشام سنان )",
        address: "دمشق - ميسات شارع برنية",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["3310600", "7465"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.53293294899914,
        longitude: 36.29821566572238,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "ابن النفيس",
        address: "ركن الدين-تجمع ابن النفيس",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["5123637"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.54674680377432,
        longitude: 36.30696245053809,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى ابن رشد للأمراض النفسية",
        address: "كراجات العباسيين جانب مرآب وزارة الصحة",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["4418579", "4472109"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.53105375447168,
        longitude: 36.32380322506134,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "الزبداني",
        address: "الزبداني أول طلعة الجرجانية",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["7112991"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.712480494012866,
        longitude: 36.11294324164675,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "جيرود",
        address: "أول جيرود- دوار المشفى",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.PARTIALLY,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["7711900", "7711901"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.805144939132276,
        longitude: 36.73662242892427,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "داريا",
        address: "داريا جانب مدرسة التمريض",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.STOPPED,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: [], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.46266654912326,
        longitude: 36.22272136060918,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى قطنا الوطني",
        address: "قطنا",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["6893400"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.428168265397225,
        longitude: 36.0690660008959,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },

    {
        name: "مشفى دوما الإسعافي",
        address: "دوما-مقابل البلدية",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["5710570"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.57178441972244,
        longitude: 36.397199181716765,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "الرازي اعام",
        address: "حلب - المحافظة - شارع  سوق الانتاج",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.GENERAL,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["2260551", "2260482", "2283500"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 36.21119252914063,
        longitude: 37.14000973860258,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "زاهي ازرق",
        address: "حلب -الهلك",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.InternalMedicine,
        phones: [{ normal: ["4462544"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 36.23107842079532,
        longitude: 37.169149022325335,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى الأسدي",
        address: "دمشق - مزة جبل",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["6132501", "3326031"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.50017371628328,
        longitude: 36.23953960022237,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى الايطالي",
        address: "دمشق - طلياني",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["3326030", "3326031"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.52287282766072,
        longitude: 36.28977209985453,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى الأندلس التخصصي",
        address: "دمشق - تنظيم فيلات كفرسوسة",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["2114363", "2114635", "2117239"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.49572944931941,
        longitude: 36.28184841388162,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى بديع حمودة",
        address: "دمشق - شركسية روضة - شارع الملك بن مروان",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["3338523"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.519866146311806,
        longitude: 36.28600958648044,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى البشير",
        address: "دمشق - زاهرة غرب الفرن الالي",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["6318143", "6311166"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.46956258735983,
        longitude: 36.3302812498982,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى التوفيق",
        address: "دمشق - ابو رمانة -  شارع الأرجنتين",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["2228250", "2216364", "2229436"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.51498801746512,
        longitude: 36.2893921397549,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    },
    {
        name: "مشفى دار العيون و التجميل الجراحي",
        address: "دمشق - السبع بحرات - عين الكرش - دخلة السوق الحرة",
        cityId: new Types.ObjectId(),
        authAccountId: new Types.ObjectId(),
        category: HospitalCategory.PRIVATE,
        hospitalstatus: HospitalStatus.WORKS,
        hospitalSpecialization: HospitalSpecialization.GeneralMedicine,
        phones: [{ normal: ["2327281", "2327282"], clinic: [], whatsup: [], emergency: [] }],
        latitude: 33.51941450460495,
        longitude: 36.29699750969316,
        rating: 3,
        status: ApprovalStatus.APPROVED,
        subscriptionId: null,
        isSubscribed: false,
        searchCount: 0,
        profileViews: 0
    }
];

async function seedAll() {
    const app = await NestFactory.createApplicationContext(DatabaseModule);

    const AuthAccountModel = app.get(getModelToken('AuthAccount'));
    const DoctorModel = app.get(getModelToken('Doctor'));
    const HospitalModel = app.get(getModelToken('Hospital'));
    const CenterModel = app.get(getModelToken('Center'));
    const UserModel = app.get(getModelToken('User'));
    const OtpModel = app.get(getModelToken('Otp'));
    const PublicSpecModel = app.get(getModelToken('PublicSpecialization'));
    const PrivateSpecModel = app.get(getModelToken('PrivateSpecialization'));

    console.log('🗑️ Clearing all collections...');
    await Promise.all([
        DoctorModel.deleteMany({}),
        HospitalModel.deleteMany({}),
        CenterModel.deleteMany({}),
        UserModel.deleteMany({}),
        AuthAccountModel.deleteMany({}),
        OtpModel.deleteMany({}),
        PublicSpecModel.deleteMany({}),
        PrivateSpecModel.deleteMany({})
    ]);
    console.log('✅ Collections cleared.\n');

    // 1️⃣ Public Specializations
    const publicDocs: (typeof PublicSpecialization & { _id: Types.ObjectId })[] = [];
    for (const spec of Object.values(GeneralSpecialty)) {
        const doc = await PublicSpecModel.create({ name: spec });
        publicDocs.push(doc);
    }

    // 2️⃣ Private Specializations
    const privateSpecMapping: Record<GeneralSpecialty, PrivateMedicineSpecialty[]> = {
        [GeneralSpecialty.HumanMedicine]: [PrivateMedicineSpecialty.GeneralPractitioner, PrivateMedicineSpecialty.Cardiology, PrivateMedicineSpecialty.Pediatrics, PrivateMedicineSpecialty.Neurology],
        [GeneralSpecialty.Dentistry]: [PrivateMedicineSpecialty.GeneralDentistry, PrivateMedicineSpecialty.Orthodontics, PrivateMedicineSpecialty.Implantology],
        [GeneralSpecialty.Psychiatry]: [PrivateMedicineSpecialty.GeneralPsychiatry, PrivateMedicineSpecialty.AddictionTreatment, PrivateMedicineSpecialty.ChildPsychiatry],
        [GeneralSpecialty.Physiotherapy]: [PrivateMedicineSpecialty.Rehabilitation, PrivateMedicineSpecialty.SportsPhysiotherapy],
        [GeneralSpecialty.Veterinary]: [PrivateMedicineSpecialty.GeneralVeterinary]
    };

    for (const pub of publicDocs) {
        const privs = privateSpecMapping[pub.name as GeneralSpecialty] || [];
        const docs = privs.map(p => ({ name: p, publicSpecializationId: pub._id }));
        const inserted = await PrivateSpecModel.insertMany(docs);
        privateDocs.push(...inserted);
    }

    // 3️⃣ AuthAccounts لكل الأنواع
    const authAccounts: any[] = [];
    let counter = 1;

    // Doctors
    for (let i = 0; i < 5; i++) {
        authAccounts.push(await AuthAccountModel.create({
            phones: [formatPhone(counter++)],
            role: UserRole.DOCTOR,
            isActive: true
        }));
    }

    // Hospitals
    for (let i = 0; i < hospitalsData.length; i++) {
        authAccounts.push(await AuthAccountModel.create({
            phones: [formatPhone(counter++)], // فقط سترينغ
            role: UserRole.HOSPITAL,
            isActive: true
        }));
    }

    // Centers
    for (let i = 0; i < 3; i++) {
        authAccounts.push(await AuthAccountModel.create({
            phones: [formatPhone(counter++)],
            role: UserRole.CENTER,
            isActive: true
        }));
    }

    // Users
    for (let i = 0; i < 5; i++) {
        authAccounts.push(await AuthAccountModel.create({
            phones: [formatPhone(counter++)],
            role: UserRole.USER,
            isActive: true
        }));
    }

    // 4️⃣ إنشاء المستشفيات وربطها بـ AuthAccounts
    for (let i = 0; i < hospitalsData.length; i++) {
        const h = hospitalsData[i];
        await HospitalModel.create({
            authAccountId: authAccounts[5 + i]._id,
            name: h.name,
            address: h.address,
            cityId: new Types.ObjectId(),
            category: h.category,
            hospitalstatus: h.hospitalstatus,
            hospitalSpecialization: h.hospitalSpecialization,
            phones: [
                {
                    normal: [formatPhone(counter++)],
                    clinic: [],
                    whatsup: [],
                    emergency: []
                }
            ],
            rating: 4,
            status: ApprovalStatus.APPROVED
        });
    }

    // 5️⃣ Centers
    const centerSpecs = Object.values(CenterSpecialization);
    for (let i = 0; i < 3; i++) {
        await CenterModel.create({
            authAccountId: authAccounts[hospitalsData.length + 5 + i]._id,
            name: `مركز ${i + 1}`,
            address: `الشارع الرئيسي ${i + 1}`,
            cityId: new Types.ObjectId(),
            centerSpecialization: centerSpecs[i % centerSpecs.length],
            phones: [{
                normal: [formatPhone(counter++)],
                clinic: [],
                whatsup: [],
                emergency: []
            }],
            rating: 3 + i
        });
    }

    // 6️⃣ Doctors
    for (let i = 0; i < 5; i++) {
        const privSpec = privateDocs[i % privateDocs.length];
        const pubSpec = publicDocs[i % publicDocs.length];

        await DoctorModel.create({
            authAccountId: authAccounts[i]._id,
            firstName: `DoctorFirst${String.fromCharCode(65+i)}`,
            middleName: `Middle${String.fromCharCode(65+i)}`,
            lastName: `LastName${String.fromCharCode(65+i)}`,
            password: 'hashedPassword',
            privateSpecialization: privSpec.name, 
            publicSpecialization: pubSpec.name,  
            city: City.Damascus,
            subcity: 'المزة',  // مثال
            cityId: new Types.ObjectId(),
            phones: [{ normal: [formatPhone(counter++)], clinic: [], whatsup: [], emergency: [] }],
            status: ApprovalStatus.APPROVED,
            rating: 3 + (i % 3)
        });

    }

    // 7️⃣ Users & OTP
    for (let i = 0; i < 5; i++) {
        const userAuth = authAccounts[hospitalsData.length + 8 + i];
        const phone = formatPhone(counter++);
        await UserModel.create({
            authAccountId: userAuth._id,
            username: `User${String.fromCharCode(65+i)}`,
            phone,
            gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
            city: City.Damascus,
            DataofBirth: randomDOB(),
            status: ApprovalStatus.APPROVED
        });

        await OtpModel.create({
            authAccountId: userAuth._id,
            code: ('00000' + i).slice(-6),
            phone,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            isUsed: false,
            attempts: 0
        });
    }

    console.log('🎉 Seeding Complete!');
    await app.close();
}

seedAll().catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
