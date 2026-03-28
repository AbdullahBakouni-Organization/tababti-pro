import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
export class WhatsappService implements OnModuleInit {
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

      // Open browser once to show the QR page
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
        ? `مرحباً بك في *طبابتي* 👨‍⚕️

  رمز التحقق الخاص بك هو:

  ┌─────────────────┐
        *${otp}*
  └─────────────────┘

  ⏱ صالح لمدة *5 دقائق* فقط.
  🔒 لا تشارك هذا الرمز مع أي شخص كان.

  إذا لم تكن أنت من طلب هذا الرمز، فتجاهل هذه الرسالة وقم بتغيير كلمة مرورك فوراً.

  — فريق *طبابتي* الطبي`
        : `Welcome to *Tababti* 👨‍⚕️

  Your verification code is:

  ┌─────────────────┐
        *${otp}*
  └─────────────────┘

  ⏱ Valid for *5 minutes* only.
  🔒 Never share this code with anyone.

  If you didn't request this code, ignore this message and change your password immediately.

  — The *Tababti* Medical Team`;

    await this.sendMessage(phone, text, lang);
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private formatPhone(phone: string): string {
    // Strip all non-digit characters then append WhatsApp suffix
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

  // Add these three methods inside WhatsappService, alongside sendOtp

  async sendDoctorWelcome(phone: string, doctorName: string): Promise<void> {
    const text = `👋 أهلاً وسهلاً د. ${doctorName}،

  شكراً لتسجيلك في منصة *طبابتي* 🩺

  لقد استلمنا طلب انضمامك بنجاح، وهو الآن قيد المراجعة من قِبل فريقنا المختص.

  سيتم إشعارك فور اتخاذ القرار بشأن طلبك.

  نتطلع إلى شراكتك معنا في تقديم أفضل الخدمات الطبية 💙
  — فريق *طبابتي*`;

    await this.sendMessage(phone, text, 'ar');
  }

  async sendDoctorApproved(phone: string, doctorName: string): Promise<void> {
    const text = `✅ تهانينا د. ${doctorName}!

  يسعدنا إخبارك بأن طلب انضمامك إلى منصة *طبابتي* قد تمت الموافقة عليه رسمياً 🎉

  حسابك الآن مفعّل ويمكنك البدء باستخدام المنصة وتقديم خدماتك الطبية للمرضى.

  نتمنى لك تجربة مميزة معنا، ونحن هنا لدعمك في كل خطوة 💙
  — فريق *طبابتي*`;

    await this.sendMessage(phone, text, 'ar');
  }

  async sendDoctorRejected(
    phone: string,
    doctorName: string,
    reason?: string,
  ): Promise<void> {
    const reasonLine = reason ? `\n📋 *السبب:* ${reason}\n` : '';

    const text = `❌ د. ${doctorName}، نأسف لإبلاغك

  بعد مراجعة طلب انضمامك إلى منصة *طبابتي*، لم نتمكن من قبول الطلب في الوقت الحالي.
  ${reasonLine}
  إذا كنت تعتقد أن هذا القرار جاء بسبب معلومات ناقصة أو خطأ ما، يمكنك التواصل مع فريق الدعم لمراجعة طلبك مجدداً.

  نشكر اهتمامك بالانضمام إلينا ونتمنى لك التوفيق 🙏
  — فريق *طبابتي*`;

    await this.sendMessage(phone, text, 'ar');
  }
}
