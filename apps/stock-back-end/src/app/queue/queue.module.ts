import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { OrderProcessor, TradeProcessor, MarketDataProcessor } from './queue.processor';
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
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
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
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
      {
        name: 'trade-processing',
        defaultJobOptions: {
          removeOnComplete: 200,
          removeOnFail: 100,
        },
      },
      {
        name: 'market-data-update',
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
        },
      },
    ),
    // 导入依赖模块
    OrderModule,
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