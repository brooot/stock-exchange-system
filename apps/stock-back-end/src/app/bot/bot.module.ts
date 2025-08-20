import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UserModule } from '../user/user.module';
import { OrderModule } from '../order/order.module';
import { NegativeDetectionService } from '../common/negative-detection.service';
import { TradeModule } from '../trade/trade.module';

@Module({
  imports: [PrismaModule, UserModule, OrderModule, TradeModule],
  controllers: [BotController],
  providers: [BotService, NegativeDetectionService],
  exports: [BotService],
})
export class BotModule {}
