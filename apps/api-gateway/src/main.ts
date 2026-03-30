import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { GlobalExceptionFilter } from './filters/http-exception.filter';

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

  if (isProduction && allowedOrigins.length === 0) {
    logger.warn(
      'ALLOWED_ORIGINS is not set in production — all cross-origin requests will be blocked.',
    );
  }

  app.enableCors({
    origin: (origin: string | undefined, callback) => {
      // Allow server-to-server requests (Postman, curl, mobile apps) — no Origin header
      if (!origin) return callback(null, true);

      // In development with no origins configured, allow everything
      if (!isProduction && allowedOrigins.length === 0)
        return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      callback(new Error(`CORS policy: origin "${origin}" is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
