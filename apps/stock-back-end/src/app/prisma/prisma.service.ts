import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // 构建包含连接池参数的DATABASE_URL - 优化连接池配置
    const databaseUrl =
      process.env.DATABASE_URL ||
      `postgresql://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}?connection_limit=30&pool_timeout=60&connect_timeout=30&socket_timeout=60`;

    super({
      // 数据源配置
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      // 增加事务超时时间到 60 秒，避免复杂事务超时
      transactionOptions: {
        timeout: 60000, // 60 秒
        maxWait: 10000, // 等待事务开始的最大时间 10 秒
        isolationLevel: 'ReadCommitted', // 使用读已提交隔离级别减少锁冲突
      },
      // 只启用错误和警告日志，关闭查询日志以减少输出
      log:
        process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
