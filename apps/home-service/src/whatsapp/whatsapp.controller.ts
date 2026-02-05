import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('qr')
  async getQr(@Res() res: Response) {
    const qr = this.whatsappService.getQrCode();

    if (!qr) {
      return res.send('<h2>✅ WhatsApp client is ready, no QR required</h2>');
    }

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp QR Code</title>
        <style>
          body {
            display:flex; 
            flex-direction:column; 
            justify-content:center; 
            align-items:center; 
            height:100vh; 
            font-family:sans-serif;
          }
          img { max-width: 300px; margin-top:20px; }
          h2 { color:#333; }
        </style>
      </head>
      <body>
        <h2>Scan QR Code to connect WhatsApp</h2>
        <img src="${qr}" alt="WhatsApp QR Code" />
      </body>
      </html>
    `);
  }
}
