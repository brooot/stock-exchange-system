import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { UserModule } from '../user/user.module';
import { PositionModule } from '../position/position.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [UserModule, PositionModule, WebsocketModule],
  providers: [OrderService],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrderModule {}
