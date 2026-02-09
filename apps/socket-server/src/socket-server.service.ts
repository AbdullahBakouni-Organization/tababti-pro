// import {
//   WebSocketGateway,
//   WebSocketServer,
//   SubscribeMessage,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
//   ConnectedSocket,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Logger } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';

// interface JwtPayload {
//   sub: string;
//   role: string;
//   [key: string]: any;
// }

// interface SocketData {
//   adminId: string;
//   role: string;
// }

// interface TypedSocket extends Socket {
//   data: SocketData;
// }

// @WebSocketGateway({
//   namespace: '/admin',
//   cors: {
//     origin: '*',
//     credentials: true,
//   },
//   transports: ['websocket'], // clean & fast
// })
// export class SocketServerService
//   implements OnGatewayConnection, OnGatewayDisconnect
// {
//   @WebSocketServer()
//   server: Server;

//   private readonly logger = new Logger(SocketServerService.name);

//   // adminId -> socket
//   private connectedAdmins = new Map<string, Socket>();

//   constructor(private readonly jwtService: JwtService) {}

//   // ==============================
//   // CONNECTION (HANDSHAKE AUTH)
//   // ==============================

//   async handleConnection(client: TypedSocket) {
//     try {
//       const handshakeAuth = client.handshake.auth as
//         | { token?: string }
//         | undefined;
//       const token: string | undefined = handshakeAuth?.token;

//       if (!token || typeof token !== 'string') {
//         this.logger.warn('❌ Missing or invalid token');
//         client.disconnect();
//         return;
//       }

//       const decoded: JwtPayload = await this.jwtService.verifyAsync(token);

//       if (!decoded || !decoded.sub || !decoded.role) {
//         this.logger.warn('❌ Invalid token payload');
//         client.disconnect();
//         return;
//       }

//       if (decoded.role !== 'admin') {
//         this.logger.warn('❌ Non-admin connection rejected');
//         client.disconnect();
//         return;
//       }

//       const adminId = decoded.sub;

//       client.data = {
//         adminId: adminId,
//         role: decoded.role,
//       };

//       this.connectedAdmins.set(adminId, client);

//       this.logger.log(
//         `✅ Admin connected: ${adminId} (Total: ${this.connectedAdmins.size})`,
//       );

//       client.emit('connected', {
//         adminId,
//         timestamp: new Date(),
//       });
//     } catch (err) {
//       const error = err as Error;
//       this.logger.error('❌ Auth failed', error.message);
//       client.disconnect();
//     }
//   }

//   handleDisconnect(client: TypedSocket) {
//     const adminId: string = client.data?.adminId;

//     if (adminId) {
//       this.connectedAdmins.delete(adminId);
//       this.logger.log(
//         `❌ Admin disconnected: ${adminId} (Remaining: ${this.connectedAdmins.size})`,
//       );
//     }
//   }

//   // ==============================
//   // CLIENT → SERVER
//   // ==============================

//   @SubscribeMessage('get-stats')
//   handleGetStats(@ConnectedSocket() client: TypedSocket) {
//     client.emit('stats', this.getStats());
//   }

//   // ==============================
//   // SERVER → CLIENT
//   // ==============================

//   sendToAllAdmins(event: string, payload: any) {
//     let sent = 0;

//     for (const [adminId, socket] of this.connectedAdmins.entries()) {
//       socket.emit(event, {
//         ...payload,
//         adminId,
//         timestamp: new Date(),
//       });
//       sent++;
//     }

//     this.logger.log(`📡 Event "${event}" sent to ${sent} admins`);

//     return { sent, event };
//   }

//   sendToAdmin(adminId: string, event: string, payload: any) {
//     const socket = this.connectedAdmins.get(adminId);

//     if (!socket) {
//       this.logger.warn(`⚠️ Admin not connected: ${adminId}`);
//       return { sent: false };
//     }

//     socket.emit(event, {
//       ...payload,
//       timestamp: new Date(),
//     });

//     return { sent: true };
//   }

//   // ==============================
//   // UTILS
//   // ==============================

//   getStats() {
//     const socketCount = this.server?.sockets?.sockets?.size ?? 0;

//     return {
//       totalConnections: socketCount,
//       connectedAdmins: this.connectedAdmins.size,
//       adminIds: Array.from(this.connectedAdmins.keys()),
//       timestamp: new Date(),
//     };
//   }

//   isAdminConnected(adminId: string) {
//     return this.connectedAdmins.has(adminId);
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
import { AuthValidateService } from '@app/common/auth-validate'; // Your auth service
import { UserRole } from '@app/common/database/schemas/common.enums';

interface JwtPayload {
  sub: string;
  role: string;
  sessionId: string;
  tv: number; // token version
  exp?: number; // expiration timestamp
  [key: string]: any;
}

interface SocketData {
  adminId: string;
  role: string;
  sessionId: string;
  tokenVersion: number;
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

  // ✅ NEW: Track token expiration timers
  private expirationTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly authValidateService: AuthValidateService, // ✅ NEW: Inject auth service
  ) {}

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

      // ✅ NEW: Verify token using AuthValidateService (checks expiration, token version, session)
      const decoded: JwtPayload =
        await this.authValidateService.verifyAccessToken(token);

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

      // ✅ NEW: Validate account and session
      const account = await this.authValidateService.getAccount(decoded.sub);

      if (!account) {
        this.logger.warn('❌ Account not found');
        client.disconnect();
        return;
      }

      if (!account.isActive) {
        this.logger.warn('❌ Account is deactivated');
        client.disconnect();
        return;
      }

      // ✅ NEW: Check token version (global revocation)
      if (decoded.tv !== account.tokenVersion) {
        this.logger.warn(
          '❌ Token revoked (password changed or global logout)',
        );
        client.disconnect();
        return;
      }

      // ✅ NEW: Verify session exists and is active
      if (decoded.sessionId) {
        const sessions = await this.authValidateService.getActiveSessions(
          decoded.sub,
          UserRole.ADMIN,
        );

        const sessionExists = sessions.some(
          (s) => s.sessionId === decoded.sessionId,
        );

        if (!sessionExists) {
          this.logger.warn('❌ Session revoked or expired');
          client.disconnect();
          return;
        }
      }

      const adminId = decoded.sub;

      client.data = {
        adminId: adminId,
        role: decoded.role,
        sessionId: decoded.sessionId,
        tokenVersion: decoded.tv,
      };

      this.connectedAdmins.set(adminId, client);

      // ✅ NEW: Schedule automatic disconnect when token expires
      this.scheduleTokenExpiration(client, decoded);

      this.logger.log(
        `✅ Admin connected:(Total: ${this.connectedAdmins.size})`,
      );

      client.emit('connected', {
        adminId,
        expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null,
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

      // ✅ NEW: Clear expiration timer
      this.clearExpirationTimer(adminId);

      this.logger.log(
        `❌ Admin disconnected:(Remaining: ${this.connectedAdmins.size})`,
      );
    }
  }

  // ==============================
  // ✅ NEW: TOKEN EXPIRATION HANDLING
  // ==============================

  /**
   * Schedule automatic disconnect when access token expires
   */
  private scheduleTokenExpiration(client: TypedSocket, decoded: JwtPayload) {
    const adminId = client.data.adminId;

    // Clear existing timer if any
    this.clearExpirationTimer(adminId);

    if (!decoded.exp) {
      this.logger.warn(`⚠️ Token has no expiration for admin: ${adminId}`);
      return;
    }

    // Calculate time until expiration
    const expiresAt = decoded.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiration = expiresAt - now;

    if (timeUntilExpiration <= 0) {
      // Token already expired
      this.logger.warn(`❌ Token already expired for admin`);
      client.disconnect();
      return;
    }

    // Schedule disconnect
    const timer = setTimeout(() => {
      this.logger.log(`⏰ Token expired for admin - disconnecting`);

      // Emit event to client before disconnecting
      client.emit('token-expired', {
        message: 'Your session has expired. Please reconnect with a new token.',
        timestamp: new Date(),
      });

      // Disconnect the client
      client.disconnect();
    }, timeUntilExpiration);

    this.expirationTimers.set(adminId, timer);

    this.logger.log(
      `⏰ Scheduled disconnect for admin:in ${Math.round(timeUntilExpiration / 1000)}s`,
    );
  }

  /**
   * Clear expiration timer for an admin
   */
  private clearExpirationTimer(adminId: string) {
    const timer = this.expirationTimers.get(adminId);
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(adminId);
    }
  }

  // ==============================
  // ✅ NEW: TOKEN REFRESH HANDLER
  // ==============================

  /**
   * Allow client to refresh their token without reconnecting
   */
  @SubscribeMessage('refresh-token')
  async handleRefreshToken(
    @ConnectedSocket() client: TypedSocket,
    payload: { token: string },
  ) {
    try {
      const { token } = payload;

      if (!token || typeof token !== 'string') {
        client.emit('refresh-error', { message: 'Invalid token' });
        return;
      }

      // Verify new token
      const decoded: JwtPayload =
        await this.authValidateService.verifyAccessToken(token);

      if (!decoded || decoded.sub !== client.data.adminId) {
        client.emit('refresh-error', { message: 'Token mismatch' });
        client.disconnect();
        return;
      }

      // Validate account and session
      const account = await this.authValidateService.getAccount(decoded.sub);

      if (!account || !account.isActive) {
        client.emit('refresh-error', { message: 'Account invalid' });
        client.disconnect();
        return;
      }

      // Check token version
      if (decoded.tv !== account.tokenVersion) {
        client.emit('refresh-error', { message: 'Token revoked' });
        client.disconnect();
        return;
      }

      // Update client data
      client.data.sessionId = decoded.sessionId;
      client.data.tokenVersion = decoded.tv;

      // Reschedule expiration
      this.scheduleTokenExpiration(client, decoded);

      this.logger.log(`🔄 Token refreshed for admin: ${client.data.adminId}`);

      client.emit('token-refreshed', {
        message: 'Token refreshed successfully',
        expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null,
        timestamp: new Date(),
      });
    } catch (err) {
      const error = err as Error;
      this.logger.error('❌ Token refresh failed', error.message);
      client.emit('refresh-error', { message: 'Token refresh failed' });
      client.disconnect();
    }
  }

  // ==============================
  // ✅ NEW: VALIDATE CURRENT TOKEN
  // ==============================

  /**
   * Check if current token is still valid
   */
  @SubscribeMessage('validate-token')
  async handleValidateToken(@ConnectedSocket() client: TypedSocket) {
    try {
      const adminId = client.data.adminId;
      const sessionId = client.data.sessionId;
      const tokenVersion = client.data.tokenVersion;

      // Check account
      const account = await this.authValidateService.getAccount(adminId);

      if (!account || !account.isActive) {
        client.emit('token-invalid', { reason: 'Account invalid' });
        client.disconnect();
        return;
      }

      // Check token version
      if (tokenVersion !== account.tokenVersion) {
        client.emit('token-invalid', { reason: 'Token revoked' });
        client.disconnect();
        return;
      }

      // Check session
      const sessions = await this.authValidateService.getActiveSessions(
        adminId,
        UserRole.ADMIN,
      );

      const sessionExists = sessions.some((s) => s.sessionId === sessionId);

      if (!sessionExists) {
        client.emit('token-invalid', { reason: 'Session revoked' });
        client.disconnect();
        return;
      }

      client.emit('token-valid', {
        message: 'Token is valid',
        timestamp: new Date(),
      });
    } catch (err) {
      const error = err as Error;
      this.logger.error('❌ Token validation failed', error.message);
      client.emit('token-invalid', { reason: 'Validation failed' });
      client.disconnect();
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
  // ✅ NEW: FORCE DISCONNECT ADMIN
  // ==============================

  /**
   * Force disconnect an admin (useful for logout-all, password change, etc.)
   */
  disconnectAdmin(adminId: string, reason: string = 'Session terminated') {
    const socket = this.connectedAdmins.get(adminId);

    if (socket) {
      socket.emit('force-disconnect', {
        reason,
        timestamp: new Date(),
      });

      socket.disconnect();
      this.logger.log(`🔌 Admin force-disconnected:- ${reason}`);
      return true;
    }

    return false;
  }

  /**
   * Disconnect all admins (useful for system maintenance)
   */
  disconnectAllAdmins(reason: string = 'Server maintenance') {
    let disconnected = 0;

    for (const [adminId, socket] of this.connectedAdmins.entries()) {
      socket.emit('force-disconnect', {
        reason,
        timestamp: new Date(),
      });

      socket.disconnect();
      disconnected++;
    }

    this.logger.log(`🔌 All admins disconnected: ${disconnected} - ${reason}`);
    return disconnected;
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
      expirationTimers: this.expirationTimers.size,
      timestamp: new Date(),
    };
  }

  isAdminConnected(adminId: string) {
    return this.connectedAdmins.has(adminId);
  }

  // ✅ NEW: Get connection info for an admin
  getAdminConnectionInfo(adminId: string) {
    const socket = this.connectedAdmins.get(adminId) as TypedSocket | undefined;

    if (!socket) {
      return null;
    }

    return {
      adminId,
      sessionId: socket.data?.sessionId,
      tokenVersion: socket.data?.tokenVersion,
      connected: true,
      hasExpirationTimer: this.expirationTimers.has(adminId),
    };
  }
}
