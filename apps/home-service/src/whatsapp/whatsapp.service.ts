import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import open from 'open';

type Lang = 'en' | 'ar';

interface PendingMessage {
  phone: string;
  text: string;
  lang: Lang;
}

@Injectable()
export class WhatsappService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(WhatsappService.name);
  private currentQrCode: string | null = null;
  private ready = false;
  private pendingMessages: PendingMessage[] = [];

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
      this.currentQrCode = await qrcode.toDataURL(qr);
      console.log(await qrcode.toString(qr, { type: 'terminal' }));
      open('http://localhost:3001/api/v1/whatsapp/qr').catch(() => {});
    });

    this.client.on('ready', async () => {
      this.ready = true;
      this.logger.log('✅ WhatsApp client ready');
      await this.flushPendingMessages();
    });

    this.client.on('auth_failure', (msg) => {
      this.logger.error(`❌ WhatsApp auth failed: ${msg}`);
    });

    this.client.on('disconnected', (reason) => {
      this.ready = false;
      this.logger.warn(`⚠️ WhatsApp disconnected: ${reason}`);
    });

    this.client.initialize();
  }

  getQrCode(): string | null {
    return this.currentQrCode;
  }

  private formatPhone(phone: string): string {
    return phone.replace(/\D/g, '') + '@c.us';
  }

  private async flushPendingMessages() {
    this.logger.log(
      `🔔 Sending ${this.pendingMessages.length} pending messages...`,
    );
    while (this.pendingMessages.length > 0) {
      const msg = this.pendingMessages.shift();
      if (msg) await this.sendMessage(msg.phone, msg.text, msg.lang);
    }
  }

  async sendMessage(phone: string, text: string, lang: Lang = 'en') {
    this.logger.log(`📲 [sendMessage] Preparing to send message to ${phone}`);

    if (!this.ready) {
      this.logger.warn(
        `⚠️ [sendMessage] WhatsApp client not ready. Queuing message for ${phone}`,
      );
      this.pendingMessages.push({ phone, text, lang });
      return;
    }

    const formatted = this.formatPhone(phone);
    this.logger.log(`📲 [sendMessage] Formatted phone: ${formatted}`);

    try {
      const msg: Message = await this.client.sendMessage(formatted, text);
      this.logger.log(`✅ [sendMessage] Message sent: ${msg.id._serialized}`);
    } catch (err) {
      this.logger.error(
        `❌ [sendMessage] Failed to send message to ${formatted}: ${err.message}`,
        err.stack,
      );
    }
  }

  async sendOtp(phone: string, otp: string, lang: Lang = 'en') {
    this.logger.log(
      `🔑 [sendOtp] Sending OTP ${otp} to ${phone} (lang: ${lang})`,
    );
    const text =
      lang === 'ar'
        ? `🔐 رمز التحقق:\n\n*${otp}*\n\n⛔ لا تشاركه مع أحد`
        : `🔐 Your OTP:\n\n*${otp}*\n\n⛔ Do not share it`;
    await this.sendMessage(phone, text, lang);
  }
}
