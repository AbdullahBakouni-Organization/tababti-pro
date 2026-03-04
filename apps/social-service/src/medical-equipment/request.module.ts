import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Controllers
import { LegalAdviceController } from './controllers/legal-advice.controller';
import { AdminLegalAdviceController } from './controllers/admin-legal-advice.controller';
import { MedicalEquipmentController } from './controllers/medical-equipment.controller';
import { AdminMedicalEquipmentController } from './controllers/admin-medical-equipment.controller';

// Services
import { LegalAdviceService } from './services/legal-advice.service';
import { MedicalEquipmentService } from './services/medical.equipment.service';

// Repositories
import { LegalAdviceRepository } from './repositories/legal-advice.repository';
import { MedicalEquipmentRepository } from './repositories/medical-equipment.repository';

// Schemas
import { LegalAdviceRequest, LegalAdviceRequestSchema } from '@app/common/database/schemas/legal_advice_requests.schema';
import { MedicalEquipmentRequest, MedicalEquipmentRequestSchema } from '@app/common/database/schemas/medical_equipment_requests.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: LegalAdviceRequest.name, schema: LegalAdviceRequestSchema },
            { name: MedicalEquipmentRequest.name, schema: MedicalEquipmentRequestSchema },
        ]),
    ],
    controllers: [
        LegalAdviceController,
        AdminLegalAdviceController,
        MedicalEquipmentController,
        AdminMedicalEquipmentController,
    ],
    providers: [
        LegalAdviceService,
        LegalAdviceRepository,
        MedicalEquipmentService,
        MedicalEquipmentRepository,
    ],
    exports: [LegalAdviceService, MedicalEquipmentService],
})
export class RequestsModule { }