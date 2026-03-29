/**
 * Mock factories for all shared services used across the monorepo.
 * Each factory returns a mock object matching the service's public API.
 */

// ── KafkaService ──
export function createMockKafkaService() {
  return {
    emit: jest.fn(),
    send: jest.fn().mockResolvedValue(undefined),
    subscribeToTopic: jest.fn(),
    consume: jest.fn().mockResolvedValue(undefined),
    onModuleInit: jest.fn().mockResolvedValue(undefined),
  };
}

// ── CacheService ──
export function createMockCacheService() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    onModuleInit: jest.fn().mockResolvedValue(undefined),
  };
}

// ── RedisService ──
export function createMockRedisService() {
  return {
    // Key-value
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
    incr: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
    incrby: jest.fn().mockResolvedValue(1),
    // Hash
    hset: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue(null),
    hgetall: jest.fn().mockResolvedValue({}),
    hdel: jest.fn().mockResolvedValue(1),
    // List
    lpush: jest.fn().mockResolvedValue(1),
    rpush: jest.fn().mockResolvedValue(1),
    lpop: jest.fn().mockResolvedValue(null),
    lrange: jest.fn().mockResolvedValue([]),
    // Set
    sadd: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    sismember: jest.fn().mockResolvedValue(0),
    srem: jest.fn().mockResolvedValue(1),
    // Sorted set
    zadd: jest.fn().mockResolvedValue(1),
    zrange: jest.fn().mockResolvedValue([]),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    // Pub/Sub
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    // Pattern
    keys: jest.fn().mockResolvedValue([]),
    deletePattern: jest.fn().mockResolvedValue(undefined),
    // Lifecycle
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}

// ── MinioService ──
export function createMockMinioService() {
  const mockUploadResult = {
    fileName: 'test-file.jpg',
    originalName: 'original.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    bucket: 'test-bucket',
    url: 'http://localhost:9000/test-bucket/test-file.jpg',
    etag: 'mock-etag',
  };

  return {
    uploadFile: jest.fn().mockResolvedValue(mockUploadResult),
    uploadDoctorDocument: jest.fn().mockResolvedValue(mockUploadResult),
    getPublicUrl: jest
      .fn()
      .mockReturnValue('http://localhost:9000/test-bucket/test-file.jpg'),
    getPresignedUrl: jest
      .fn()
      .mockResolvedValue('http://localhost:9000/presigned-url'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    deleteFiles: jest.fn().mockResolvedValue(undefined),
    fileExists: jest.fn().mockResolvedValue(true),
    getFileMetadata: jest.fn().mockResolvedValue({ size: 1024 }),
    listFiles: jest.fn().mockResolvedValue([]),
  };
}

// ── FcmService ──
export function createMockFcmService() {
  return {
    sendBookingCancellationNotification: jest.fn().mockResolvedValue(true),
    sendBookingCancellationNotificationToDoctor: jest
      .fn()
      .mockResolvedValue(true),
    sendBookingCompletionNotification: jest.fn().mockResolvedValue(true),
    sendBookingRescheduledNotification: jest.fn().mockResolvedValue(true),
    sendMulticastNotification: jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    }),
    sendAdminApprovedPostNotification: jest.fn().mockResolvedValue(true),
    sendAdminRejectedPostNotification: jest.fn().mockResolvedValue(true),
    sendAdminApprovedGalleryImagesNotification: jest
      .fn()
      .mockResolvedValue(true),
    sendAdminRejectedGalleryImagesNotification: jest
      .fn()
      .mockResolvedValue(true),
    sendAdminApprovedUserQuestionsNotification: jest
      .fn()
      .mockResolvedValue(true),
    sendAdminRejectedUserQuestionsNotification: jest
      .fn()
      .mockResolvedValue(true),
    sendSlotsRefreshedNotification: jest.fn().mockResolvedValue(true),
    verifyToken: jest.fn().mockResolvedValue(true),
    subscribeToTopic: jest
      .fn()
      .mockResolvedValue({ successCount: 1, failureCount: 0 }),
  };
}

// ── AuthValidateService ──
export function createMockAuthValidateService() {
  return {
    generateTokenPair: jest.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
    generateTokenUserPair: jest.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
    verifyAccessToken: jest.fn().mockReturnValue({
      sub: 'mock-account-id',
      phone: '+963912345678',
      role: 'user',
      tv: 1,
      type: 'access',
    }),
    verifyRefreshToken: jest.fn().mockReturnValue({
      sub: 'mock-account-id',
      phone: '+963912345678',
      role: 'user',
      tv: 1,
      type: 'refresh',
    }),
    createSession: jest.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
    refreshAccessToken: jest.fn().mockResolvedValue({
      accessToken: 'mock-new-access-token',
      refreshToken: 'mock-new-refresh-token',
    }),
    refreshUserAccessToken: jest.fn().mockResolvedValue({
      accessToken: 'mock-new-access-token',
      refreshToken: 'mock-new-refresh-token',
    }),
    logoutSession: jest.fn().mockResolvedValue(undefined),
    logoutDevice: jest.fn().mockResolvedValue(undefined),
    logoutAllSessions: jest.fn().mockResolvedValue(undefined),
    revokeAllTokens: jest.fn().mockResolvedValue(undefined),
    getActiveSessions: jest.fn().mockResolvedValue([]),
    updateSessionActivity: jest.fn().mockResolvedValue(undefined),
    getAccount: jest.fn().mockResolvedValue(null),
    validateUser: jest.fn().mockResolvedValue(null),
    validateUserRole: jest.fn().mockResolvedValue(null),
  };
}

// ── BookingValidationService ──
export function createMockBookingValidationService() {
  return {
    validateBooking: jest.fn().mockResolvedValue({
      canBook: true,
      currentBookingsWithDoctor: 0,
      currentBookingsToday: 0,
      maxBookingsWithDoctor: 1,
      maxBookingsPerDay: 3,
    }),
  };
}

// ── ConfigService ──
export function createMockConfigService(
  overrides: Record<string, string> = {},
) {
  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://localhost:27017',
    MONGO_DB: 'test-db',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    REDIS_PASSWORD: '',
    KAFKA_BROKER: 'localhost:29092',
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_ACCESS_KEY: 'test-access-key',
    MINIO_SECRET_KEY: 'test-secret-key',
    MINIO_BUCKET_DOCTORS: 'test-doctors',
    MINIO_BUCKET_PATIENTS: 'test-patients',
    MINIO_BUCKET_GENERAL: 'test-general',
    ...overrides,
  };

  return {
    get: jest.fn(
      (key: string, defaultValue?: string) =>
        defaults[key] ?? defaultValue ?? '',
    ),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in defaults)) throw new Error(`Config key "${key}" not found`);
      return defaults[key];
    }),
  };
}
