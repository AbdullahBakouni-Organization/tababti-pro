// ============================================
// Simple WebSocket Test Script with Auto Token Refresh
// No external dependencies (browser/Node.js compatible)
// ============================================

import { io } from 'socket.io-client';

// ============================================
// Configuration
// ============================================

const CONFIG = {
  socketUrl: 'http://localhost:3007/admin',
  apiUrl: 'http://localhost:3007',

  // Your tokens
  accessToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTg1ZGIyMTA1MTIxZWM0OTdhYjYyZWUiLCJwaG9uZSI6Iis5NjM5Njg2Nzk1NzIiLCJyb2xlIjoiYWRtaW4iLCJzZXNzaW9uSWQiOiJiYmRhYTg5NC0wZGY2LTQ0YmQtYTc2YS1kOTQzMDU1ZjAzNWQiLCJkZXZpY2VJZCI6InBvc3RtYW4tbG9jYWwtMDAxIiwidHYiOjAsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NzAzOTUwNDksImV4cCI6MTc3MDM5NTk0OX0.R-juRwY2RPCmKN9hirci1rfzuDD8VDvp8JmK55vGL7c',
  refreshToken: 'YOUR_REFRESH_TOKEN_HERE', // ⚠️ ADD YOUR REFRESH TOKEN
};

// ============================================
// Token Helper Functions
// ============================================

function decodeToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('❌ Failed to decode token:', error);
    return null;
  }
}

function getTokenExpiration(token) {
  const decoded = decodeToken(token);
  if (decoded && decoded.exp) {
    return new Date(decoded.exp * 1000);
  }
  return null;
}

function getTimeUntilExpiration(token) {
  const expiresAt = getTokenExpiration(token);
  if (!expiresAt) return null;
  return expiresAt.getTime() - Date.now();
}

// ============================================
// State
// ============================================

let currentAccessToken = CONFIG.accessToken;
let currentRefreshToken = CONFIG.refreshToken;
let refreshTimer = null;
let socket = null;

// ============================================
// Token Refresh
// ============================================

async function refreshAccessToken() {
  try {
    console.log('🔄 Refreshing access token...');

    const response = await fetch(`${CONFIG.apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentRefreshToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    currentAccessToken = data.data.accessToken;
    currentRefreshToken = data.data.refreshToken;

    console.log('✅ Token refreshed successfully');

    return true;
  } catch (error) {
    console.error('❌ Token refresh failed:', error.message);
    return false;
  }
}

async function handleTokenRefresh() {
  console.log('\n' + '='.repeat(50));
  console.log('🔄 REFRESHING TOKEN');
  console.log('='.repeat(50));

  // 1. Get new token from API
  const success = await refreshAccessToken();

  if (!success) {
    console.error('❌ Failed to get new token');
    console.log('='.repeat(50) + '\n');
    return;
  }

  // 2. Send new token to WebSocket server
  console.log('📤 Sending new token to WebSocket server...');
  socket.emit('refresh-token', {
    token: currentAccessToken,
  });

  console.log('='.repeat(50) + '\n');
}

// ============================================
// Token Refresh Scheduler
// ============================================

function scheduleTokenRefresh() {
  // Clear existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const timeUntilExpiration = getTimeUntilExpiration(currentAccessToken);

  if (!timeUntilExpiration) {
    console.warn('⚠️ Cannot schedule refresh: no expiration time');
    return;
  }

  if (timeUntilExpiration <= 0) {
    console.warn('⚠️ Token already expired!');
    handleTokenRefresh();
    return;
  }

  // Refresh 1 minute before expiration (or 80% of lifetime)
  const refreshBuffer = 60 * 1000; // 60 seconds
  const refreshTime = Math.max(
    timeUntilExpiration - refreshBuffer,
    timeUntilExpiration * 0.8,
  );

  if (refreshTime <= 0) {
    console.warn('⚠️ Token expires too soon, refreshing immediately');
    handleTokenRefresh();
    return;
  }

  const expiresAt = getTokenExpiration(currentAccessToken);
  console.log(`⏰ Token expires at: ${expiresAt?.toLocaleTimeString()}`);
  console.log(`⏰ Will refresh in: ${Math.round(refreshTime / 1000)} seconds`);
  console.log(
    `⏰ Time until expiration: ${Math.round(timeUntilExpiration / 1000)} seconds\n`,
  );

  refreshTimer = setTimeout(() => {
    console.log('🔄 Time to refresh token...');
    handleTokenRefresh();
  }, refreshTime);
}

// ============================================
// WebSocket Connection
// ============================================

console.log('🚀 Connecting to WebSocket with auto token refresh...\n');

// Show initial token info
const decoded = decodeToken(currentAccessToken);
console.log('📋 Initial Token Info:');
console.log('   Admin ID:', decoded?.sub);
console.log('   Role:', decoded?.role);
console.log('   Session ID:', decoded?.sessionId);
console.log(
  '   Expires:',
  getTokenExpiration(currentAccessToken)?.toLocaleString(),
);
console.log(
  '   Time until expiration:',
  Math.round(getTimeUntilExpiration(currentAccessToken) / 1000),
  'seconds\n',
);

socket = io(CONFIG.socketUrl, {
  transports: ['websocket'],
  auth: {
    token: currentAccessToken,
  },
});

// ============================================
// Event Handlers
// ============================================

socket.on('connect', () => {
  console.log('✅ Connected', socket.id);

  // Schedule automatic token refresh
  scheduleTokenRefresh();

  // Get initial stats
  socket.emit('get-stats');
});

socket.on('connected', (data) => {
  console.log('✅ Server confirmed connection:', data);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);

  // Clear refresh timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

// ============================================
// Token Events
// ============================================

socket.on('token-expired', async (data) => {
  console.warn('⏰ Token expired:', data.message);

  // Try to refresh immediately
  await handleTokenRefresh();
});

socket.on('token-refreshed', (data) => {
  console.log('✅ Token refreshed on server:', data);

  // Schedule next refresh
  scheduleTokenRefresh();
});

socket.on('refresh-error', (data) => {
  console.error('❌ Token refresh error:', data.message);
});

socket.on('token-valid', (data) => {
  console.log('✅ Token is valid:', data);
});

socket.on('token-invalid', (data) => {
  console.error('❌ Token is invalid:', data.reason);
});

socket.on('force-disconnect', (data) => {
  console.warn('🔌 Force disconnected:', data.reason);
});

// ============================================
// Application Events
// ============================================

socket.on('stats', (data) => {
  console.log('📊 Stats:', data);
});

// ============================================
// Catch All Events
// ============================================

socket.onAny((event, payload) => {
  const handledEvents = [
    'connect',
    'connected',
    'disconnect',
    'connect_error',
    'token-expired',
    'token-refreshed',
    'refresh-error',
    'token-valid',
    'token-invalid',
    'force-disconnect',
    'stats',
  ];

  if (!handledEvents.includes(event)) {
    console.log(`📨 Event received: "${event}"`);
    console.log(payload);
  }
});

// ============================================
// Helper Functions (for testing in console)
// ============================================

// Make these available globally for testing
if (typeof window !== 'undefined') {
  window.wsTest = {
    getStats: () => socket.emit('get-stats'),
    validateToken: () => socket.emit('validate-token'),
    refreshToken: handleTokenRefresh,
    showTokenInfo: () => {
      const current = decodeToken(currentAccessToken);
      const expires = getTokenExpiration(currentAccessToken);
      console.log('\n📋 Current Token Info:');
      console.log('   Expires:', expires?.toLocaleString());
      console.log(
        '   Time until expiration:',
        Math.round(getTimeUntilExpiration(currentAccessToken) / 1000),
        'seconds\n',
      );
    },
    disconnect: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    },
  };

  console.log('\n💡 TIP: Use these commands in browser console:');
  console.log('   wsTest.getStats()      - Get connection stats');
  console.log('   wsTest.validateToken() - Validate current token');
  console.log('   wsTest.refreshToken()  - Manually refresh token');
  console.log('   wsTest.showTokenInfo() - Show token expiration info');
  console.log('   wsTest.disconnect()    - Disconnect from server\n');
}

// For Node.js
if (typeof global !== 'undefined') {
  global.getStats = () => socket.emit('get-stats');
  global.validateToken = () => socket.emit('validate-token');
  global.refreshToken = handleTokenRefresh;
  global.showTokenInfo = () => {
    const current = decodeToken(currentAccessToken);
    const expires = getTokenExpiration(currentAccessToken);
    console.log('\n📋 Current Token Info:');
    console.log('   Expires:', expires?.toLocaleString());
    console.log(
      '   Time until expiration:',
      Math.round(getTimeUntilExpiration(currentAccessToken) / 1000),
      'seconds\n',
    );
  };

  console.log('\n💡 TIP: Use these commands in Node.js:');
  console.log('   getStats()      - Get connection stats');
  console.log('   validateToken() - Validate current token');
  console.log('   refreshToken()  - Manually refresh token');
  console.log('   showTokenInfo() - Show token expiration info\n');
}
