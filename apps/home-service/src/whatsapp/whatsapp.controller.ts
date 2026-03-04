import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // ── GET /whatsapp/qr ──────────────────────────────────────────────────────
  // Renders an HTML page with the QR code image.
  // Opens automatically in the browser when a new QR is generated.

  @Get('qr')
  getQr(@Res() res: Response) {
    const qr = this.whatsappService.getQrCode();

    if (!qr) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>WhatsApp Status</title>${this.pageStyles()}</head>
        <body>
          <div class="card">
            <span class="icon">✅</span>
            <h2>WhatsApp is connected</h2>
            <p>No QR code needed — the session is active.</p>
          </div>
        </body>
        </html>
      `);
    }

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Code</title>
        ${this.pageStyles()}
        <meta http-equiv="refresh" content="30">
      </head>
      <body>
        <div class="card">
          <span class="icon">📱</span>
          <h2>Scan to connect WhatsApp</h2>
          <p>Open WhatsApp → Linked Devices → Link a Device</p>
          <img src="${qr}" alt="WhatsApp QR Code" />
          <small>Page refreshes automatically every 30 seconds</small>
        </div>
      </body>
      </html>
    `);
  }

  // ── GET /whatsapp/status ──────────────────────────────────────────────────

  @Get('status')
  getStatus() {
    return {
      ready: this.whatsappService.isClientReady(),
      hasQr: !!this.whatsappService.getQrCode(),
    };
  }

  // ── GET /whatsapp/test-otp ────────────────────────────────────────────────
  // Dev/testing only — remove or guard this in production

  @Get('test-otp')
  async testOtp() {
    const phone = '+963938144669';
    const otp = '1234';
    await this.whatsappService.sendOtp(phone, otp, 'ar');
    return { success: true, message: 'OTP queued for delivery' };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private pageStyles(): string {
    return `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: #f0f2f5;
          font-family: sans-serif;
        }
        .card {
          background: #fff;
          border-radius: 16px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          max-width: 380px;
          width: 100%;
        }
        .icon { font-size: 48px; }
        h2 { margin: 16px 0 8px; color: #111; }
        p  { color: #666; font-size: 14px; margin-bottom: 20px; }
        img { width: 100%; border-radius: 8px; margin-bottom: 12px; }
        small { color: #aaa; font-size: 12px; }
      </style>
    `;
  }
}
