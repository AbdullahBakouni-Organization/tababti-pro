// import {
//   WebSocketGateway,
//   WebSocketServer,
//   SubscribeMessage,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
//   ConnectedSocket,
//   MessageBody,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Logger } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';

// @WebSocketGateway({
//   // ✅ CRITICAL: Proper CORS configuration
//   cors: {
//     origin: '*', // Allow all origins
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },

//   // ✅ Namespace
//   namespace: '/admin',

//   // ✅ Transport options
//   transports: ['websocket', 'polling'], // Support both

//   // ✅ Allow upgrades
//   allowEIO3: true,
// })
// export class SocketServerService
//   implements OnGatewayConnection, OnGatewayDisconnect
// {
//   @WebSocketServer()
//   server: Server;

//   private readonly logger = new Logger(SocketServerService.name);

//   // Store connected admin clients: Map<adminId, Socket>
//   private connectedAdmins: Map<string, Socket> = new Map();

//   constructor(private jwtService: JwtService) {}

//   // ============================================
//   // Connection Lifecycle
//   // ============================================

//   /**
//    * Called when admin connects to WebSocket
//    */
//   handleConnection(client: Socket) {
//     this.logger.log(`Client attempting to connect: ${client.id}`);

//     // Safe check for server initialization
//     const connectionCount = this.server?.sockets?.sockets?.size || 0;
//     this.logger.log(`Current connections: ${connectionCount}`);
//   }

//   /**
//    * Called when admin disconnects
//    */
//   handleDisconnect(client: Socket) {
//     const adminId = client.data.adminId;

//     if (adminId) {
//       this.connectedAdmins.delete(adminId);
//       this.logger.log(`Admin disconnected: ${adminId} (ID: ${client.id})`);
//       this.logger.log(`Connected admins: ${this.connectedAdmins.size}`);
//     } else {
//       this.logger.log(`Client disconnected: ${client.id}`);
//     }
//   }

//   // ============================================
//   // Client -> Server Events
//   // ============================================

//   /**
//    * Admin subscribes to notifications
//    *
//    * Client code (React/Vue/Angular):
//    * socket.emit('subscribe-admin', { adminId: '123', token: 'jwt...' })
//    */
//   @SubscribeMessage('subscribe-admin')
//   async handleAdminSubscribe(
//     @ConnectedSocket() client: Socket,
//     @MessageBody() payload: { adminId: string; token: string },
//   ) {
//     try {
//       this.logger.log(`Admin subscribe attempt: ${payload.adminId}`);
//       this.logger.log(`Token received: ${payload.token?.substring(0, 50)}...`);

//       // TEMPORARY: Skip JWT verification for testing
//       // TODO: Remove this bypass in production
//       const SKIP_JWT_VERIFICATION = true;

//       let decoded: any = null;

//       if (SKIP_JWT_VERIFICATION) {
//         // Temporary bypass for testing
//         this.logger.warn(
//           '⚠️ BYPASSING JWT VERIFICATION FOR TESTING - REMOVE IN PRODUCTION!',
//         );
//         decoded = {
//           sub: payload.adminId,
//           role: 'admin',
//           adminId: payload.adminId,
//         };
//       } else {
//         try {
//           // Verify JWT token
//           decoded = await this.jwtService.verifyAsync(payload.token);
//         } catch (jwtError) {
//           const error = jwtError as Error;
//           this.logger.error(`JWT verification failed: ${error.message}`);
//           this.logger.error(`Token: ${payload.token}`);
//           client.emit('error', {
//             message: `JWT verification failed: ${error.message}`,
//             code: 'JWT_INVALID',
//           });
//           client.disconnect();
//           return;
//         }
//       }

//       this.logger.log(`Decoded token: ${JSON.stringify(decoded)}`);

//       // Check if user is admin
//       if (decoded.role !== 'admin') {
//         this.logger.warn(
//           `Non-admin tried to subscribe: ${payload.adminId} (role: ${decoded.role})`,
//         );
//         client.emit('error', {
//           message: 'Access denied. Admin role required.',
//           code: 'ROLE_DENIED',
//         });
//         client.disconnect();
//         return;
//       }

//       // Store admin connection
//       this.connectedAdmins.set(payload.adminId, client);
//       client.data.adminId = payload.adminId;
//       client.data.role = 'admin';
//       client.data.subscribedAt = new Date();

//       this.logger.log(
//         `✅ Admin subscribed: ${payload.adminId} (Total: ${this.connectedAdmins.size})`,
//       );

//       // Send confirmation to client
//       client.emit('subscribed', {
//         success: true,
//         message: 'Successfully subscribed to admin notifications',
//         adminId: payload.adminId,
//         subscribedAt: new Date(),
//       });

//       // Send current stats
//       client.emit('stats', this.getStats());
//     } catch (error) {
//       const err = error as Error;
//       this.logger.error(`Failed to subscribe admin: ${err.message}`, err.stack);
//       this.logger.error(`Admin ID: ${payload?.adminId}`);
//       this.logger.error(`Token present: ${!!payload?.token}`);
//       client.emit('error', {
//         message: `Authentication failed: ${err.message}`,
//         code: 'AUTH_FAILED',
//         details: err.message,
//       });
//       client.disconnect();
//     }
//   }

//   /**
//    * Admin unsubscribes
//    */
//   @SubscribeMessage('unsubscribe-admin')
//   handleAdminUnsubscribe(@ConnectedSocket() client: Socket) {
//     const adminId = client.data.adminId;

//     if (adminId) {
//       this.connectedAdmins.delete(adminId);
//       this.logger.log(`Admin unsubscribed: ${adminId}`);
//     }

//     client.emit('unsubscribed', {
//       message: 'Unsubscribed from admin notifications',
//     });
//   }

//   /**
//    * Admin requests current stats
//    */
//   @SubscribeMessage('get-stats')
//   handleGetStats(@ConnectedSocket() client: Socket) {
//     client.emit('stats', this.getStats());
//   }

//   // ============================================
//   // Server -> Client Events (Called by HTTP controller)
//   // ============================================

//   /**
//    * Send notification to ALL connected admins
//    *
//    * Called by: HTTP controller when doctor registers
//    */
//   sendToAllAdmins(event: string, data: any) {
//     let sentCount = 0;

//     this.connectedAdmins.forEach((socket, adminId) => {
//       socket.emit(event, {
//         ...data,
//         timestamp: new Date(),
//         notificationId: `notif_${Date.now()}_${adminId}`,
//       });
//       sentCount++;
//     });

//     this.logger.log(`📡 Sent "${event}" to ${sentCount} admin(s)`);

//     return {
//       sent: true,
//       event,
//       recipientCount: sentCount,
//       timestamp: new Date(),
//     };
//   }

//   /**
//    * Send to specific admin
//    */
//   sendToAdmin(adminId: string, event: string, data: any) {
//     const socket = this.connectedAdmins.get(adminId);

//     if (socket) {
//       socket.emit(event, {
//         ...data,
//         timestamp: new Date(),
//         notificationId: `notif_${Date.now()}_${adminId}`,
//       });

//       this.logger.log(`📡 Sent "${event}" to admin: ${adminId}`);

//       return {
//         sent: true,
//         event,
//         adminId,
//         timestamp: new Date(),
//       };
//     }

//     this.logger.warn(`Admin not connected: ${adminId}`);

//     return {
//       sent: false,
//       event,
//       adminId,
//       reason: 'Admin not connected',
//     };
//   }

//   /**
//    * Broadcast to all clients (including non-admins if any)
//    */
//   broadcast(event: string, data: any) {
//     this.server.emit(event, {
//       ...data,
//       timestamp: new Date(),
//     });

//     const totalClients = this.server?.sockets?.sockets?.size || 0;
//     this.logger.log(`📡 Broadcasted "${event}" to all ${totalClients} clients`);
//   }

//   /**
//    * Get connection statistics
//    */
//   getStats() {
//     const totalConnections = this.server?.sockets?.sockets?.size || 0;
//     return {
//       totalConnections,
//       connectedAdmins: this.connectedAdmins.size,
//       adminIds: Array.from(this.connectedAdmins.keys()),
//       timestamp: new Date(),
//     };
//   }

//   /**
//    * Check if admin is connected
//    */
//   isAdminConnected(adminId: string): boolean {
//     return this.connectedAdmins.has(adminId);
//   }

//   /**
//    * Get all connected admin IDs
//    */
//   getConnectedAdminIds(): string[] {
//     return Array.from(this.connectedAdmins.keys());
//   }
// }

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface JwtPayload {
  sub: string;
  role: string;
  [key: string]: any;
}

interface SocketData {
  adminId: string;
  role: string;
}

interface TypedSocket extends Socket {
  data: SocketData;
}

@WebSocketGateway({
  namespace: '/admin',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket'], // clean & fast
})
export class SocketServerService
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketServerService.name);

  // adminId -> socket
  private connectedAdmins = new Map<string, Socket>();

  constructor(private readonly jwtService: JwtService) {}

  // ==============================
  // CONNECTION (HANDSHAKE AUTH)
  // ==============================

  async handleConnection(client: TypedSocket) {
    try {
      const handshakeAuth = client.handshake.auth as
        | { token?: string }
        | undefined;
      const token: string | undefined = handshakeAuth?.token;

      if (!token || typeof token !== 'string') {
        this.logger.warn('❌ Missing or invalid token');
        client.disconnect();
        return;
      }

      const decoded: JwtPayload = await this.jwtService.verifyAsync(token);

      if (!decoded || !decoded.sub || !decoded.role) {
        this.logger.warn('❌ Invalid token payload');
        client.disconnect();
        return;
      }

      if (decoded.role !== 'admin') {
        this.logger.warn('❌ Non-admin connection rejected');
        client.disconnect();
        return;
      }

      const adminId = decoded.sub;

      client.data = {
        adminId: adminId,
        role: decoded.role,
      };

      this.connectedAdmins.set(adminId, client);

      this.logger.log(
        `✅ Admin connected: ${adminId} (Total: ${this.connectedAdmins.size})`,
      );

      client.emit('connected', {
        adminId,
        timestamp: new Date(),
      });
    } catch (err) {
      const error = err as Error;
      this.logger.error('❌ Auth failed', error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: TypedSocket) {
    const adminId: string = client.data?.adminId;

    if (adminId) {
      this.connectedAdmins.delete(adminId);
      this.logger.log(
        `❌ Admin disconnected: ${adminId} (Remaining: ${this.connectedAdmins.size})`,
      );
    }
  }

  // ==============================
  // CLIENT → SERVER
  // ==============================

  @SubscribeMessage('get-stats')
  handleGetStats(@ConnectedSocket() client: TypedSocket) {
    client.emit('stats', this.getStats());
  }

  // ==============================
  // SERVER → CLIENT
  // ==============================

  sendToAllAdmins(event: string, payload: any) {
    let sent = 0;

    for (const [adminId, socket] of this.connectedAdmins.entries()) {
      socket.emit(event, {
        ...payload,
        adminId,
        timestamp: new Date(),
      });
      sent++;
    }

    this.logger.log(`📡 Event "${event}" sent to ${sent} admins`);

    return { sent, event };
  }

  sendToAdmin(adminId: string, event: string, payload: any) {
    const socket = this.connectedAdmins.get(adminId);

    if (!socket) {
      this.logger.warn(`⚠️ Admin not connected: ${adminId}`);
      return { sent: false };
    }

    socket.emit(event, {
      ...payload,
      timestamp: new Date(),
    });

    return { sent: true };
  }

  // ==============================
  // UTILS
  // ==============================

  getStats() {
    const socketCount = this.server?.sockets?.sockets?.size ?? 0;

    return {
      totalConnections: socketCount,
      connectedAdmins: this.connectedAdmins.size,
      adminIds: Array.from(this.connectedAdmins.keys()),
      timestamp: new Date(),
    };
  }

  isAdminConnected(adminId: string) {
    return this.connectedAdmins.has(adminId);
  }
}
