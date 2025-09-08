import { Module, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_PIPE } from '@nestjs/core';
import { TradeModule } from './trade/trade.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OrderModule } from './order/order.module';
import { PositionModule } from './position/position.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { WebsocketModule } from './websocket/websocket.module';
import { BotModule } from './bot/bot.module';
import { KlineModule } from './kline/kline.module';
// import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { NegativeDetectionService } from './common/negative-detection.service';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env.production'
          : '.env.development',
    }), // 根据环境动态加载环境变量文件
    PrismaModule,
    // RedisModule,
    QueueModule,
    AuthModule,
    UserModule,
    OrderModule,
    PositionModule,
    TradeModule,
    WebsocketModule,
    BotModule,
    KlineModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    NegativeDetectionService,
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}
