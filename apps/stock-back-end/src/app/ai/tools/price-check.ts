import { tool } from '@langchain/core/tools';
import z from 'zod';
import { TradeService } from '../../trade/trade.service';

export function createGetStockPrice(tradeService: TradeService) {
  return tool(
    async (input) => {
      // 忽略入参，直接通过服务获取当前市场价（最小化改动实现）
      const price = await tradeService.getCurrentMarketPrice();
      return `当前股票价格为：${price}`;
    },
    {
      name: 'get_current_price',
      description: '调用此工具获取当前股票价格,没有传入股票名称时候，默认使用AAPL（苹果）',
      schema: z.object({
        stock_name: z.string().describe('股票名称').default('AAPL').optional(),
      }),
    }
  );
}
