// import { Controller, Logger } from '@nestjs/common';
// import { EventPattern, Payload } from '@nestjs/microservices';
// import { WhatsappService } from './whatsapp.service';
// import { KAFKA_TOPICS } from '@app/common/kafka/events/topics';

// @Controller()
// export class WhatsappConsumer {
//   private readonly logger = new Logger(WhatsappConsumer.name);

//   constructor(private readonly whatsappService: WhatsappService) {}

//   @EventPattern(KAFKA_TOPICS.WHATSAPP_SEND_MESSAGE)
//   async handleSendMessage(@Payload() data: any) {
//     const payload = data?.value ?? data;
//     const { phone, text, lang } = payload ?? {};

//     if (!phone || !text) {
//       this.logger.error(
//         `❌ Invalid payload for WHATSAPP_SEND_MESSAGE: ${JSON.stringify(payload)}`,
//       );
//       return;
//     }

//     try {
//       await this.whatsappService.sendMessage(phone, text, lang);
//       this.logger.log(`✅ WhatsApp message sent to ${phone}`);
//     } catch (err) {
//       this.logger.error(
//         `❌ Error sending WhatsApp message to ${phone}: ${err?.message}`,
//         err?.stack,
//       );
//     }
//   }

//   @EventPattern(KAFKA_TOPICS.WHATSAPP_SEND_OTP)
//   async handleSendOtp(@Payload() data: any) {
//     const payload = data?.value ?? data;
//     const { phone, otp, lang } = payload ?? {};

//     if (!phone || !otp) {
//       this.logger.error(`❌ Invalid payload: ${JSON.stringify(payload)}`);
//       return;
//     }

//     try {
//       await this.whatsappService.sendOtp(phone, otp, lang);
//       this.logger.log(`✅ OTP sent to ${phone} successfully`);
//     } catch (err) {
//       this.logger.error(
//         `❌ Error sending OTP to ${phone}: ${err.message}`,
//         err.stack,
//       );
//     }
//   }
// }
