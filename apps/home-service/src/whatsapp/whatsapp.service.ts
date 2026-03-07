import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode';
import * as qrcodeTerminal from 'qrcode-terminal';

export type Lang = 'en' | 'ar';

interface PendingMessage {
  phone: string;
  text: string;
  lang: Lang;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private readonly logger = new Logger(WhatsappService.name);

  private currentQrCode: string | null = null;
  private isReady = false;
  private pendingMessages: PendingMessage[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

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

      console.clear();
      console.log('\nScan this QR with WhatsApp:\n');
      qrcodeTerminal.generate(qr, { small: true });

      try {
        const { default: open } = await import('open');
        await open('http://localhost:3001/api/v1/whatsapp/qr');
      } catch {}
    });

    this.client.on('ready', async () => {
      this.isReady = true;
      this.currentQrCode = null;
      this.logger.log('✅ WhatsApp client ready');
      await this.flushPendingMessages();
    });

    this.client.on('auth_failure', (msg) => {
      this.logger.error(`❌ WhatsApp auth failed: ${msg}`);
    });

    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      this.logger.warn(`⚠️ WhatsApp disconnected: ${reason}`);
    });

    this.client.initialize();
  }

  // ── يُغلق Chrome بشكل نظيف عند إيقاف الـ service ─────────────────────────
  async onModuleDestroy() {
    try {
      this.isReady = false;
      await this.client.destroy();
      this.logger.log('✅ WhatsApp client destroyed cleanly');
    } catch (err) {
      this.logger.warn(`⚠️ Error destroying WhatsApp client: ${err.message}`);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getQrCode(): string | null {
    return this.currentQrCode;
  }

  isClientReady(): boolean {
    return this.isReady;
  }

  async sendMessage(
    phone: string,
    text: string,
    lang: Lang = 'en',
  ): Promise<void> {
    if (!this.isReady) {
      this.logger.warn(`⚠️ Client not ready — queuing message for ${phone}`);
      this.pendingMessages.push({ phone, text, lang });
      return;
    }

    const formatted = this.formatPhone(phone);

    try {
      const msg: Message = await this.client.sendMessage(formatted, text);
      this.logger.log(`✅ Message sent to ${phone} [${msg.id._serialized}]`);
    } catch (err) {
      this.logger.error(
        `❌ Failed to send message to ${formatted}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  async sendOtp(phone: string, otp: string, lang: Lang = 'ar'): Promise<void> {
    const text =
      lang === 'ar'
        ? `🔐 رمز تسجيل الدخول إلى حسابك في طبابتي هو:

*${otp}*

هذا الرمز صالح لمدة 5 دقائق فقط.

حرصاً على أمان حسابك، يرجى عدم مشاركة هذا الرمز مع أي شخص.
إذا لم تقم بطلب تسجيل الدخول، يمكنك تجاهل هذه الرسالة بأمان.`
        : `🔐 Your login code for your Tababati account is:

*${otp}*

This code is valid for 5 minutes only.

For your account security, please do not share this code with anyone.
If you did not request this login, you can safely ignore this message.`;

    await this.sendMessage(phone, text, lang);
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private formatPhone(phone: string): string {
    return phone.replace(/\D/g, '') + '@c.us';
  }

  private async flushPendingMessages(): Promise<void> {
    if (!this.pendingMessages.length) return;

    this.logger.log(
      `🔔 Flushing ${this.pendingMessages.length} pending messages`,
    );

    while (this.pendingMessages.length > 0) {
      const msg = this.pendingMessages.shift();
      if (msg) {
        try {
          await this.sendMessage(msg.phone, msg.text, msg.lang);
        } catch {
          // Already logged inside sendMessage — continue flushing
        }
      }
    }
  }
}
