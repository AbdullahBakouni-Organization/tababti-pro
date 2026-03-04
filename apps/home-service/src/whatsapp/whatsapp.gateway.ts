import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WhatsappService } from './whatsapp.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class WhatsappGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhatsappGateway.name);
  private qrInterval: NodeJS.Timeout | null = null;

  constructor(private readonly whatsappService: WhatsappService) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  afterInit() {
    this.logger.log('📡 WhatsApp WebSocket Gateway initialized');

    // Broadcast QR every 3 s while it exists; stop once the client is ready
    this.qrInterval = setInterval(() => {
      const qr = this.whatsappService.getQrCode();
      if (qr) {
        this.server.emit('qr', qr);
      } else if (this.whatsappService.isClientReady()) {
        this.server.emit('ready', { message: 'WhatsApp client is connected' });
      }
    }, 3000);
  }

  handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);

    // Push current QR immediately on connect so new clients don't wait 3 s
    const qr = this.whatsappService.getQrCode();
    if (qr) client.emit('qr', qr);
    else if (this.whatsappService.isClientReady())
      client.emit('ready', { message: 'WhatsApp client is connected' });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  @SubscribeMessage('getQr')
  handleGetQr(client: Socket) {
    const qr = this.whatsappService.getQrCode();
    if (qr) {
      client.emit('qr', qr);
      this.logger.log(`📲 QR sent to client ${client.id}`);
    } else {
      client.emit('ready', { message: 'WhatsApp client is already connected' });
    }
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    client.emit('pong', { ts: Date.now() });
  }
}
