import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import {
  OrderProcessor,
  TradeProcessor,
  MarketDataProcessor,
} from './queue.processor';
import { OrderModule } from '../order/order.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { KlineModule } from '../kline/kline.module';

@Module({
  imports: [
    // 配置Bull队列
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          maxRetriesPerRequest: 3,
          // maxRetriesPerRequest: null, // 禁用请求重试限制，让Redis自己处理
          // retryDelayOnFailover: 1000,
          // connectTimeout: 30000, // 增加连接超时时间
          // lazyConnect: true, // 延迟连接，等到真正需要时再连接
          // retryDelayOnClusterDown: 300,
          // enableReadyCheck: false, // 禁用ready检查，避免LOADING状态阻塞
        },
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 10,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    // 注册队列
    BullModule.registerQueue(
      {
        name: 'order-processing',
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 10,
        },
      },
      {
        name: 'trade-processing',
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 10,
        },
      },
      {
        name: 'market-data-update',
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 10,
        },
      }
    ),
    // 导入依赖模块
    forwardRef(() => OrderModule),
    WebsocketModule,
    KlineModule,
  ],
  providers: [
    QueueService,
    OrderProcessor,
    TradeProcessor,
    MarketDataProcessor,
  ],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}
