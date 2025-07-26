import { Module } from '@nestjs/common';
import { KlineService } from './kline.service';
import { KlineController } from './kline.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [PrismaModule, WebsocketModule],
  controllers: [KlineController],
  providers: [KlineService],
  exports: [KlineService],
})
export class KlineModule {}