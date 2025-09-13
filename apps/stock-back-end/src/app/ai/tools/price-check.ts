import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { TradeService } from '../../trade/trade.service';

// 统一的参数 Schema
const StockPriceSchema = z.object({
  stock_name: z.string().describe('股票名称').default('AAPL'),
});

export function createGetStockPrice(tradeService: TradeService) {
  return tool(
    async ({ stock_name }: z.infer<typeof StockPriceSchema>) => {
      if (stock_name !== 'AAPL') {
        return '当前只支持获取AAPL（苹果）的股票价格';
      }
      const price = await tradeService.getCurrentMarketPrice();
      return `当前股票价格为：${price}`;
    },
    {
      name: 'get_current_price',
      description:
        '调用此工具获取当前股票价格,没有传入股票名称时候，默认使用AAPL（苹果）',
      schema: StockPriceSchema,
    }
  );
}
