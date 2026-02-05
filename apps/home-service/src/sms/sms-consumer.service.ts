// // home-service/src/sms/sms-consumer.service.ts

// import { KafkaService } from '@app/common/kafka/kafka.service';
// import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
// import { SmsService } from './sms.service';
// import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';

// interface DoctorRegisteredEvent {
//   data: {
//     phone: string;
//     fullName: string;
//     [key: string]: any;
//   };
//   [key: string]: any;
// }

// interface KafkaMessage {
//   value: Buffer;
//   key: Buffer | null;
//   topic: string;
//   partition: number;
//   offset: string;
// }

// @Injectable()
// export class SmsConsumerService implements OnModuleInit {
//   private readonly logger = new Logger(SmsConsumerService.name);

//   constructor(
//     private kafkaConsumer: KafkaService,
//     private smsService: SmsService, // ✅ Your existing service
//   ) {}

//   async onModuleInit() {
//     // ✅ Listen to doctor.registered
//     await this.kafkaConsumer.consume({
//       topic: KAFKA_TOPICS.DOCTOR_REGISTERED,
//       groupId: 'home-consumer',
//       onMessage: async (message: KafkaMessage) => {
//         try {
//           // Debug logging to understand the message structure
//           this.logger.debug(
//             `Raw message received: ${message.value.toString()}`,
//           );

//           const event = JSON.parse(
//             message.value.toString(),
//           ) as DoctorRegisteredEvent;

//           // Debug logging to understand the event structure
//           this.logger.debug(
//             `Parsed event structure: ${JSON.stringify(event, null, 2)}`,
//           );

//           // Validate event data
//           if (!event || !event.data) {
//             throw new Error('Invalid event data: missing event or event.data');
//           }

//           const { phone, fullName } = event.data;

//           // Comprehensive phone validation with detailed logging
//           if (!phone) {
//             this.logger.warn(
//               `Phone number is null/undefined in event, skipping SMS. Event data: ${JSON.stringify(event.data)}`,
//             );
//             return;
//           }

//           if (typeof phone !== 'string') {
//             this.logger.warn(
//               `Phone number is not a string (type: ${typeof phone}), skipping SMS. Phone value: ${String(phone)}, Event data: ${JSON.stringify(event.data)}`,
//             );
//             return;
//           }

//           const trimmedPhone = phone.trim();
//           if (trimmedPhone === '') {
//             this.logger.warn(
//               `Phone number is empty after trimming, skipping SMS. Original phone: "${phone}", Event data: ${JSON.stringify(event.data)}`,
//             );
//             return;
//           }

//           // Additional phone format validation
//           const phoneDigits = trimmedPhone.replace(/\D/g, '');
//           if (phoneDigits.length < 9) {
//             this.logger.warn(
//               `Phone number too short (${phoneDigits.length} digits: "${phoneDigits}"), skipping SMS. Original phone: "${phone}", Event data: ${JSON.stringify(event.data)}`,
//             );
//             return;
//           }

//           if (
//             !fullName ||
//             typeof fullName !== 'string' ||
//             fullName.trim() === ''
//           ) {
//             this.logger.warn(
//               `Missing or invalid fullName for phone ${trimmedPhone}, using default name`,
//             );
//           }

//           const doctorName =
//             fullName && fullName.trim() ? fullName.trim() : 'الطبيب';

//           this.logger.log(
//             `Attempting to send SMS to validated phone: "${trimmedPhone}" for doctor: "${doctorName}"`,
//           );

//           // ✅ Send SMS using your existing service
//           try {
//             await this.smsService.send({
//               to: trimmedPhone,
//               message: `مرحباً ${doctorName}! تم استلام طلبك وسيتم مراجعته من قبل الإدارة. شكراً لك.`,
//             });
//           } catch (smsError) {
//             const error = smsError as Error;
//             this.logger.error(
//               `Failed to send SMS to ${trimmedPhone}: ${error.message}`,
//             );
//             this.logger.error(`SMS error stack: ${error.stack}`);
//             // Don't throw - log error but continue processing
//             return;
//           }

//           this.logger.log(
//             `SMS sent successfully for doctor registration: ${doctorName} (${trimmedPhone})`,
//           );
//         } catch (error) {
//           this.logger.error(
//             'Error processing doctor registration message:',
//             error,
//           );

//           // Log the raw message for debugging
//           try {
//             this.logger.error(`Raw message data: ${message.value.toString()}`);
//           } catch (msgError) {
//             this.logger.error('Could not parse raw message data', msgError);
//           }

//           throw error;
//         }
//       },
//     });
//   }
// }
//
//
//
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SmsService } from './sms.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';

interface DoctorRegisteredEvent {
  eventType: string;
  timestamp: Date;
  data: {
    doctorId: string;
    phone: string;
    fullName: string;
    [key: string]: any;
  };
  metadata: {
    source: string;
    version: string;
  };
}

@Controller()
export class SmsConsumerController {
  private readonly logger = new Logger(SmsConsumerController.name);

  constructor(private readonly smsService: SmsService) {}

  @EventPattern(KAFKA_TOPICS.DOCTOR_REGISTERED)
  async handleDoctorRegistered(@Payload() event: DoctorRegisteredEvent) {
    try {
      // ✅ NO JSON.parse needed - event is already an object!
      this.logger.debug(
        `Received DOCTOR_REGISTERED event: ${JSON.stringify(event, null, 2)}`,
      );

      // Validate event data
      if (!event?.data) {
        this.logger.error('Invalid event: missing data property');
        this.logger.debug(`Event structure: ${JSON.stringify(event)}`);
        return;
      }

      const { phone, fullName } = event.data;

      // Phone validation
      if (!phone || typeof phone !== 'string') {
        this.logger.warn(`Invalid phone number, skipping SMS. Phone: ${phone}`);
        return;
      }

      const trimmedPhone = phone.trim();
      if (trimmedPhone === '') {
        this.logger.warn('Phone number is empty after trimming, skipping SMS');
        return;
      }

      // Validate phone has enough digits
      const phoneDigits = trimmedPhone.replace(/\D/g, '');
      if (phoneDigits.length < 9) {
        this.logger.warn(
          `Phone number too short (${phoneDigits.length} digits: "${phoneDigits}"), skipping SMS`,
        );
        return;
      }

      const doctorName = fullName?.trim() || 'الطبيب';

      this.logger.log(
        `Sending SMS to ${trimmedPhone} for doctor: ${doctorName}`,
      );

      // Send SMS
      await this.smsService.send({
        to: trimmedPhone,
        message: `مرحباً ${doctorName}! تم استلام طلبك وسيتم مراجعته من قبل الإدارة. شكراً لك.`,
      });

      this.logger.log(
        `✅ SMS sent successfully to ${trimmedPhone} for ${doctorName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing DOCTOR_REGISTERED event: ${error.message}`,
      );
      this.logger.error(error.stack);
      // Don't throw - avoid blocking the queue
    }
  }
}
