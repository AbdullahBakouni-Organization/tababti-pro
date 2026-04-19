import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { GlobalExceptionFilter } from './filters/http-exception.filter';
import { validateEnv, JWT_RULES } from '@app/common/config/env.validation';

// Fail fast before Nest boots if required env vars are missing/malformed.
validateEnv([
  ...JWT_RULES,
  { name: 'HOME_SERVICE_URL', minLength: 8 },
  { name: 'SOCIAL_SERVICE_URL', minLength: 8 },
  { name: 'BOOKING_SERVICE_URL', minLength: 8 },
  { name: 'NOTIFICATION_SERVICE_URL', minLength: 8 },
  { name: 'REDIS_HOST', minLength: 1 },
  { name: 'REDIS_PORT', pattern: /^\d+$/ },
]);

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app =
    await NestFactory.create<NestExpressApplication>(ApiGatewayModule);

  // ================= Cookie Parser =================
  app.use(cookieParser());

  // ================= Security (Helmet) =================
  // Must be registered BEFORE CORS so headers apply to preflight responses too
  app.use(
    helmet({
      // Disabled for a pure API gateway — CSP is meaningful only when serving HTML
      contentSecurityPolicy: false,

      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31_536_000, // 1 year in seconds (HSTS preload minimum)
        includeSubDomains: true,
        preload: true,
      },
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'no-referrer' },
      // xssFilter omitted — deprecated header, removed from modern browsers,
      // and can introduce vulnerabilities in old IE
    }),
  );

  // ================= CORS =================
  const isProduction = process.env.NODE_ENV === 'production';

  const allowedOrigins: string[] = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];

  // TODO(temp): test client served from localhost:3004 — remove once the
  // frontend ships with its real origin in ALLOWED_ORIGINS.
  const TEMP_ALLOWED_ORIGINS = [
    'http://localhost:3004',
    'http://localhost:3005',
    'https://localhost:3004',
    'https://localhost:3005',
  ];

  if (isProduction && allowedOrigins.length === 0) {
    logger.warn(
      'ALLOWED_ORIGINS is not set in production — all cross-origin requests will be blocked.',
    );
  }

  app.enableCors({
    origin: (origin: string | undefined, callback) => {
      // Allow server-to-server requests (Postman, curl, mobile apps) — no Origin header
      if (!origin) return callback(null, true);

      // Temporary explicit allowlist for the test client.
      if (TEMP_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

      // In development with no origins configured, allow everything
      if (!isProduction && allowedOrigins.length === 0)
        return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      callback(new Error(`CORS policy: origin "${origin}" is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // `allowedHeaders` intentionally omitted — when undefined, the cors
    // middleware reflects whatever the browser sent in
    // `Access-Control-Request-Headers`. The previous strict list
    // (`Content-Type`, `Authorization`) failed preflight whenever the
    // client added a custom header (x-device-id, x-request-id, etc.).
    exposedHeaders: ['x-request-id'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
    maxAge: 86400,
  });

  // ================= Global Validation =================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in the DTO
      forbidNonWhitelisted: true, // Reject requests with extra properties
      transform: true, // Auto-transform payloads to DTO class instances
      transformOptions: {
        enableImplicitConversion: true, // e.g. '42' → 42 for @IsNumber() fields
      },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  // ================= Start Server =================
  const port = parseInt(process.env.GATEWAY_PORT ?? '3000', 10);
  await app.listen(port);

  logger.log(
    `API Gateway is running on port ${port} [${process.env.NODE_ENV ?? 'development'}]`,
  );
}

void bootstrap();
