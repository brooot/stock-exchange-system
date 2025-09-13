import { Injectable } from '@nestjs/common';
import { Tool, Context } from '@rekog/mcp-nest';
import { z } from 'zod';
import { TradeService } from '../trade/trade.service';

@Injectable()
export class McpTools {
  constructor(private readonly tradeService: TradeService) {}

  @Tool({
    name: 'get_apple_stock_price',
    description: '获取brooot交易系统中的当前苹果（AAPL）股票价格',
    parameters: z.object({}),
  })
  async getAppleStockPrice(_: unknown, context: Context): Promise<string> {
    const price = await this.tradeService.getCurrentMarketPrice();
    await context.reportProgress?.({ progress: 100, total: 100 });
    return `brooot交易系统中苹果股票价格是${price}`;
  }
}
