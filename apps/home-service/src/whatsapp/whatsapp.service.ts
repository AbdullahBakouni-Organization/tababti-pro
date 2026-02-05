import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import open from 'open';

type Lang = 'en' | 'ar';

const messages = {
  en: {
    otpSent: 'OTP sent successfully',
    messageSent: 'Message sent successfully',
    sendFailed: 'Failed to send message, retrying...',
  },
  ar: {
    otpSent: 'تم إرسال رمز التحقق بنجاح',
    messageSent: 'تم إرسال الرسالة بنجاح',
    sendFailed: 'فشل إرسال الرسالة، جارٍ إعادة المحاولة...',
  },
};

@Injectable()
export class WhatsappService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(WhatsappService.name);
  private readonly maxRetries = 3;
  private currentQrCode: string | null = null;
  private browserOpened = false;

  onModuleInit() {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: 'tababti-whatsapp' }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.client.on('qr', async (qr: string) => {
      this.logger.log('📱 New WhatsApp QR generated');

      const qrTerminal = await qrcode.toString(qr, { type: 'terminal' });
      console.log(qrTerminal);

      this.currentQrCode = await qrcode.toDataURL(qr);

      if (!this.browserOpened) {
        this.browserOpened = true;
        setTimeout(
          () => open('http://localhost:3001/api/v1/whatsapp/qr'),
          1000,
        );
      }
    });

    this.client.on('ready', () => {
      this.logger.log('✅ WhatsApp client ready');
      this.currentQrCode = null;
    });

    this.client.on('auth_failure', (msg) => {
      this.logger.error(`❌ WhatsApp auth failed: ${msg}`);
    });

    this.client.on('disconnected', (reason) => {
      this.logger.warn(`⚠️ WhatsApp disconnected: ${reason}`);
    });

    this.client.initialize();
  }

  getQrCode(): string | null {
    return this.currentQrCode;
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendMessage(phone: string, text: string, lang: Lang = 'en') {
    const formatted = phone.replace('+', '') + '@c.us';
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        await this.client.sendMessage(formatted, text);
        this.logger.log(
          `[WhatsAppService] ${messages[lang].messageSent} to ${phone}`,
        );
        return true;
      } catch (err) {
        attempt++;
        this.logger.warn(
          `[WhatsAppService] ${messages[lang].sendFailed} (Attempt ${attempt})`,
        );
        if (attempt >= this.maxRetries) {
          this.logger.error(
            `[WhatsAppService] Could not send message to ${phone}`,
            err.stack,
          );
          throw err;
        }
        await this.delay(1000);
      }
    }
  }

  async sendOtp(phone: string, otp: string) {
    const text = `🔐 رمز التحقق الخاص بك هو \n\n*${otp}*\n\n⛔ لا تشاركه مع أي شخص`;
    await this.sendMessage(phone, text);
    return { success: true, message: messages.en.otpSent };
  }
}
