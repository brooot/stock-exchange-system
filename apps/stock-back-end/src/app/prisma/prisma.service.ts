import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // 构建包含连接池参数的DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL || 
      `postgresql://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}?connection_limit=20&pool_timeout=30&connect_timeout=60`;
    
    super({
      // 数据源配置
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      // 增加事务超时时间到 30 秒
      transactionOptions: {
        timeout: 30000, // 30 秒
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}