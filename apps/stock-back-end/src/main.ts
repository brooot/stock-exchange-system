/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import cookieParser from 'cookie-parser';
import { getCorsOrigins } from './utils/cors-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 配置 cookie-parser 中间件
  app.use(cookieParser());

  // 配置 CORS - 根据环境区分
  const corsOrigins = getCorsOrigins();

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // 允许携带认证信息
  });

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
  Logger.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  Logger.log(`🌐 CORS enabled for origins: ${corsOrigins.join(', ')}`);
}

bootstrap();
