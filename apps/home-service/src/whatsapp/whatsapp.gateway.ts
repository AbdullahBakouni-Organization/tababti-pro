// import {
//   WebSocketGateway,
//   WebSocketServer,
//   OnGatewayInit,
//   SubscribeMessage,
//   MessageBody,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Logger } from '@nestjs/common';
// import { WhatsappService } from './whatsapp.service';

// @WebSocketGateway({
//   cors: {
//     origin: '*',
//   },
// })
// export class WhatsappGateway implements OnGatewayInit {
//   @WebSocketServer() server: Server;
//   private readonly logger = new Logger(WhatsappGateway.name);

//   constructor(private readonly whatsappService: WhatsappService) {}

//   afterInit() {
//     this.logger.log('📡 WhatsApp WebSocket Gateway initialized');

//     setInterval(() => {
//       const qr = this.whatsappService.getQrCode();
//       if (qr) {
//         this.logger.log('🔔 Emitting new WhatsApp QR to connected clients');
//         this.server.emit('qr', qr);
//       }
//     }, 3000);
//   }

//   @SubscribeMessage('getQr')
//   handleGetQr(client: Socket) {
//     const qr = this.whatsappService.getQrCode();
//     if (qr) {
//       client.emit('qr', qr);
//       this.logger.log(`📲 QR sent to client ${client.id}`);
//     }
//   }

//   @SubscribeMessage('ping')
//   handlePing(@MessageBody() data: any, client: Socket) {
//     client.emit('pong', data);
//   }
// }
