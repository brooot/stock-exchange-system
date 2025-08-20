import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { UserModule } from '../user/user.module';
import { PositionModule } from '../position/position.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { KlineModule } from '../kline/kline.module';
import { QueueModule } from '../queue/queue.module';
import { NegativeDetectionService } from '../common/negative-detection.service';

@Module({
  imports: [
    UserModule,
    PositionModule,
    WebsocketModule,
    KlineModule,
    forwardRef(() => QueueModule),
    BullModule.registerQueue(
      { name: 'order-processing' },
      { name: 'trade-processing' }
    ),
  ],
  providers: [OrderService, NegativeDetectionService],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrderModule {}
