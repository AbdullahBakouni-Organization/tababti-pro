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

interface DoctorApprovedEvent {
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

interface DoctorRejectedEvent {
  eventType: string;
  timestamp: Date;
  data: {
    doctorId: string;
    phone: string;
    fullName: string;
    [key: string]: any;
    reason: string;
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

      // Send SMS
      await this.smsService.send({
        to: trimmedPhone,
        message: `مرحباً ${doctorName}! تم استلام طلبك وسيتم مراجعته من قبل الإدارة. شكراً لك.`,
      });

      this.logger.log(
        `✅ SMS sent successfully to ${trimmedPhone} for ${doctorName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error processing DOCTOR_REGISTERED event: ${err.message}`,
      );
      this.logger.error(err.stack);
      // Don't throw - avoid blocking the queue
    }
  }

  @EventPattern(KAFKA_TOPICS.DOCTOR_APPROVED)
  async handleDoctorApproved(@Payload() event: DoctorApprovedEvent) {
    try {
      // ✅ NO JSON.parse needed - event is already an object!

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

      // Send SMS
      await this.smsService.send({
        to: trimmedPhone,
        message: `مرحباً ${doctorName}،
        تم اعتماد حسابك من قبل الإدارة. يمكنك الآن الدخول إلى لوحة التحكم وإدارة حسابك.
        في حال احتجت لأي مساعدة، لا تتردد في التواصل مع فريق الدعم.`,
      });

      this.logger.log(
        `✅ SMS sent successfully to ${trimmedPhone} for ${doctorName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error processing DOCTOR_REGISTERED event: ${err.message}`,
      );
      this.logger.error(err.stack);
      // Don't throw - avoid blocking the queue
    }
  }

  @EventPattern(KAFKA_TOPICS.DOCTOR_REJECTED)
  async handleDoctorRejected(@Payload() event: DoctorRejectedEvent) {
    try {
      // ✅ NO JSON.parse needed - event is already an object!

      // Validate event data
      if (!event?.data) {
        this.logger.error('Invalid event: missing data property');
        this.logger.debug(`Event structure: ${JSON.stringify(event)}`);
        return;
      }

      const { phone, fullName, reason } = event.data;

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

      // Send SMS
      await this.smsService.send({
        to: trimmedPhone,
        message: `مرحباً ${doctorName}،
        نود إعلامك بأنه لم يتم اعتماد حسابك من قبل الإدارة في الوقت الحالي.

        السبب:
        ${reason}

        يمكنك تحديث بياناتك أو رفع المستندات المطلوبة وإعادة إرسال الطلب للمراجعة.
        في حال احتجت لأي مساعدة، لا تتردد في التواصل مع فريق الدعم.`,
      });

      this.logger.log(
        `✅ SMS sent successfully to ${trimmedPhone} for ${doctorName}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error processing DOCTOR_REGISTERED event: ${err.message}`,
      );
      this.logger.error(err.stack);
      // Don't throw - avoid blocking the queue
    }
  }
}
