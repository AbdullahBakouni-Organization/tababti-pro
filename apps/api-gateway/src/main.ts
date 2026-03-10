import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
async function bootstrap() {
  const app =
    await NestFactory.create<NestExpressApplication>(ApiGatewayModule);

  app.use(cookieParser());
  // ================= Global Validation =================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove unexpected properties
      forbidNonWhitelisted: true, // Throw error on extra properties
      transform: true, // Convert payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Automatically convert primitive types
      },
    }),
  );
  // ================= Security =================
  // app.use(
  //   helmet({
  //     crossOriginResourcePolicy: true,
  //     contentSecurityPolicy: true,
  //     crossOriginEmbedderPolicy: true,
  //     crossOriginOpenerPolicy: true,
  //     dnsPrefetchControl: true,
  //     frameguard: true,
  //     hidePoweredBy: true,
  //     hsts: true,
  //     ieNoOpen: true,
  //     noSniff: true,
  //     originAgentCluster: true,
  //     permittedCrossDomainPolicies: true,
  //     referrerPolicy: true,
  //     xssFilter: true, // Allow CORS for images/static
  //   }),
  // );

  // ================= CORS =================
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['*']; // ← fallback لو الـ env فاضي
  console.log('allow', allowedOrigins);
  app.enableCors({
    origin: (origin: string | undefined, callback) => {
      if (!origin) {
        // Allow requests like curl or Postman (no origin)
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    },
    credentials: true, // Allow cookies and Authorization headers
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Allow common methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Explicit allowed headers
  });

  // ================= Start Server =================
  const port = process.env.GATEWAY_PORT || 3000;
  await app.listen(port);
  console.log(`API Gateway running on port ${port}`);
}

bootstrap();
