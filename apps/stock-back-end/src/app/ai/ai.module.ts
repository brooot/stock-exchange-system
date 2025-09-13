import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OrderModule } from '../order/order.module';
import { TradeService } from '../trade/trade.service';
import { UserService } from '../user/user.service';
import { McpTools } from './mcp.tools';
import { McpModule } from '@rekog/mcp-nest';
import { randomUUID } from 'crypto';

@Module({
  imports: [
    OrderModule,
    McpModule.forRoot({
      name: 'stock-ai-mcp',
      version: '0.0.1',
      streamableHttp: {
        enableJsonResponse: true,
        sessionIdGenerator: () => randomUUID(),
        statelessMode: false,
      },
    }),
  ],
  controllers: [AiController],
  providers: [AiService, TradeService, UserService, McpTools],
})
export class AiModule {}
