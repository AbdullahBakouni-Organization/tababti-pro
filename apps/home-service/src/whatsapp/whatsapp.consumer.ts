import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WhatsappService, Lang } from './whatsapp.service';
import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';
import {
  WhatsappSendMessageEvent,
  WhatsappSendOtpEvent,
} from '@app/common/kafka/events/whatsapp.events';
import {
  WhatsappDoctorApprovedEvent,
  WhatsappDoctorRejectedEvent,
  WhatsappDoctorWelcomeEvent,
} from '@app/common/kafka/interfaces/kafka-event.interface';

@Controller()
export class WhatsappConsumer {
  private readonly logger = new Logger(WhatsappConsumer.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  // ── whatsapp.send.message ─────────────────────────────────────────────────

  @EventPattern(KAFKA_TOPICS.WHATSAPP_SEND_MESSAGE)
  async handleSendMessage(@Payload() data: any) {
    const payload: WhatsappSendMessageEvent = data?.value ?? data;
    const { phone, text, lang } = payload ?? {};

    if (!phone || !text) {
      this.logger.error(
        `❌ Invalid payload for WHATSAPP_SEND_MESSAGE: ${JSON.stringify(payload)}`,
      );
      return;
    }

    try {
      await this.whatsappService.sendMessage(phone, text, lang as Lang);
      this.logger.log(`✅ Message sent to ${phone}`);
    } catch (err) {
      this.logger.error(
        `❌ Failed to send message to ${phone}: ${err?.message}`,
        err?.stack,
      );
    }
  }

  // ── whatsapp.send.otp ─────────────────────────────────────────────────────

  @EventPattern(KAFKA_TOPICS.WHATSAPP_SEND_OTP)
  async handleSendOtp(@Payload() data: any) {
    const payload: WhatsappSendOtpEvent = data?.value ?? data;
    const { phone, otp, lang } = payload ?? {};

    if (!phone || !otp) {
      this.logger.error(`❌ Invalid OTP payload: ${JSON.stringify(payload)}`);
      return;
    }

    try {
      await this.whatsappService.sendOtp(phone, otp, lang as Lang);
      this.logger.log(`✅ OTP sent to ${phone}`);
    } catch (err) {
      this.logger.error(
        `❌ Failed to send OTP to ${phone}: ${err?.message}`,
        err?.stack,
      );
    }
  }
  @EventPattern(KAFKA_TOPICS.WHATSAPP_DOCTOR_WELCOME)
  async handleDoctorWelcome(@Payload() data: any) {
    const payload: WhatsappDoctorWelcomeEvent = data?.value ?? data;
    const { phone, doctorName } = payload ?? {};
    if (!phone || !doctorName) {
      this.logger.error(
        `❌ Invalid doctor welcome payload: ${JSON.stringify(payload)}`,
      );
      return;
    }
    try {
      await this.whatsappService.sendDoctorWelcome(phone, doctorName);
      this.logger.log(
        `✅ Welcome message sent to Dr. ${doctorName} [${phone}]`,
      );
    } catch (err) {
      this.logger.error(
        `❌ Failed to send welcome message to ${phone}: ${err?.message}`,
        err?.stack,
      );
    }
  }

  @EventPattern(KAFKA_TOPICS.WHATSAPP_DOCTOR_APPROVED)
  async handleDoctorApproved(@Payload() data: any) {
    const payload: WhatsappDoctorApprovedEvent = data?.value ?? data;
    const { phone, doctorName } = payload ?? {};
    if (!phone || !doctorName) {
      this.logger.error(
        `❌ Invalid doctor approved payload: ${JSON.stringify(payload)}`,
      );
      return;
    }
    try {
      await this.whatsappService.sendDoctorApproved(phone, doctorName);
      this.logger.log(
        `✅ Approval message sent to Dr. ${doctorName} [${phone}]`,
      );
    } catch (err) {
      this.logger.error(
        `❌ Failed to send approval message to ${phone}: ${err?.message}`,
        err?.stack,
      );
    }
  }

  @EventPattern(KAFKA_TOPICS.WHATSAPP_DOCTOR_REJECTED)
  async handleDoctorRejected(@Payload() data: any) {
    const payload: WhatsappDoctorRejectedEvent = data?.value ?? data;
    const { phone, doctorName, reason } = payload ?? {};
    if (!phone || !doctorName) {
      this.logger.error(
        `❌ Invalid doctor rejected payload: ${JSON.stringify(payload)}`,
      );
      return;
    }
    try {
      await this.whatsappService.sendDoctorRejected(phone, doctorName, reason);
      this.logger.log(
        `✅ Rejection message sent to Dr. ${doctorName} [${phone}]`,
      );
    } catch (err) {
      this.logger.error(
        `❌ Failed to send rejection message to ${phone}: ${err?.message}`,
        err?.stack,
      );
    }
  }
}
