import { Controller, Get, Query } from '@nestjs/common';
import { KlineService, KlineData } from './kline.service';

@Controller('kline')
export class KlineController {
  constructor(private readonly klineService: KlineService) {}

  /**
   * 获取K线数据
   * @param symbol 股票代码，默认AAPL
   * @param interval 时间周期，默认1m
   * @param limit 数据条数，默认100
   */
  @Get()
  async getKlineData(
    @Query('symbol') symbol = 'AAPL',
    @Query('interval') interval = '1m',
    @Query('limit') limit = '100'
  ): Promise<KlineData[]> {
    const limitNum = parseInt(limit, 10);
    const validLimit = isNaN(limitNum)
      ? 100
      : Math.min(Math.max(limitNum, 1), 1000);

    return await this.klineService.getKlineData(symbol, interval, validLimit);
  }

  /**
   * 获取支持的时间周期
   */
  @Get('intervals')
  getSupportedIntervals(): { intervals: string[] } {
    return {
      intervals: this.klineService.getSupportedIntervals(),
    };
  }
}
