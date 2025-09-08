import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OrderModule } from '../order/order.module';
import { TradeService } from '../trade/trade.service';

@Module({
  imports: [OrderModule],
  controllers: [AiController],
  providers: [AiService, TradeService],
})
export class AiModule {}
