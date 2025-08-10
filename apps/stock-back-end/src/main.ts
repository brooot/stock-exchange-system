/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import cookieParser from 'cookie-parser';
import { getCorsOrigins } from './utils/cors-config';
import * as fs from 'fs';
import * as path from 'path';
import { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';

async function bootstrap() {
  // 检查是否存在SSL证书文件
  const keyPath = path.join(process.cwd(), 'certs', 'www.brooot.top.key');
  const certPath = path.join(process.cwd(), 'certs', 'www.brooot.top.pem');
  const enableHttps =
    process.env.ENABLE_HTTPS === 'true' &&
    fs.existsSync(keyPath) &&
    fs.existsSync(certPath);

  // 创建HTTP应用
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

  // 启动HTTP服务器
  const httpPort = process.env.PORT || 3001;
  await app.listen(httpPort, '0.0.0.0');
  Logger.log(
    `🚀 HTTP Server running on: http://localhost:${httpPort}/${globalPrefix}`
  );

  // 如果启用HTTPS，创建HTTPS服务器
  if (enableHttps) {
    const httpsOptions: HttpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    const httpsApp = await NestFactory.create(AppModule, { httpsOptions });
    httpsApp.use(cookieParser());
    httpsApp.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
    httpsApp.setGlobalPrefix(globalPrefix);

    const httpsPort = process.env.HTTPS_PORT || 443;
    await httpsApp.listen(httpsPort, '0.0.0.0');
    Logger.log(
      `🔒 HTTPS Server running on: https://localhost:${httpsPort}/${globalPrefix}`
    );
  } else {
    Logger.warn(
      '⚠️  HTTPS certificates not found or HTTPS disabled, only HTTP server started'
    );
  }

  Logger.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  Logger.log(`🌐 CORS enabled for origins: ${corsOrigins.join(', ')}`);
}

bootstrap();
