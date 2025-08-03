import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { OrderService } from '../order/order.service';
import { MarketGateway } from '../websocket/market.gateway';
import { KlineService } from '../kline/kline.service';
import { OrderQueueData, BatchTradeProcessingData } from './queue.service';

@Processor('order-processing')
@Injectable()
export class OrderProcessor {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(private orderService: OrderService) {}

  @Process('process-order')
  async processOrder(job: Job<OrderQueueData>) {
    const { userId, symbol, type, method, price, quantity, orderId } = job.data;

    try {
      // this.logger.debug(`Processing order ${orderId} for user ${userId}`);

      // 处理订单撮合（传递orderId确保使用相同的订单ID）
      const result = await this.orderService.createOrderSync(
        userId,
        symbol,
        type,
        method,
        price,
        quantity,
        orderId
      );

      // this.logger.debug(
      //   `Order ${orderId} processed successfully: ${JSON.stringify(result)}`
      // );

      return result;
    } catch (error) {
      this.logger.error(`Failed to process order ${orderId}:`, error);
      throw error;
    }
  }
}

@Processor('trade-processing')
@Injectable()
export class TradeProcessor {
  private readonly logger = new Logger(TradeProcessor.name);

  constructor(
    private marketGateway: MarketGateway,
    private klineService: KlineService
  ) {}

  @Process('process-batch-trade')
  async processBatchTrade(job: Job<BatchTradeProcessingData>) {
    const { trades, symbol, totalVolume, timestamp } = job.data;

    try {
      // this.logger.debug(
      //   `Processing batch trade for ${symbol} with ${trades.length} trades`
      // );

      // 计算加权平均价格
      const totalValue = trades.reduce(
        (sum, trade) => sum + trade.price * trade.quantity,
        0
      );
      const avgPrice = totalValue / totalVolume;

      // 广播批量交易完成事件（只广播一次汇总信息）
      this.marketGateway.broadcastTradeCompleted({
        symbol,
        price: avgPrice,
        quantity: totalVolume,
        timestamp: new Date(timestamp),
        tradeId: trades[0].id, // 使用第一个交易的ID作为代表
        batchSize: trades.length,
      });

      // 触发K线数据更新（使用最后一个交易的价格）
      const lastTrade = trades[trades.length - 1];
      await this.klineService.handlePriceUpdate({
        symbol,
        price: lastTrade.price,
        volume: totalVolume,
        timestamp: new Date(timestamp),
        tradeId: lastTrade.id,
      });

      // 广播价格更新事件（使用最后一个交易的价格）
      this.marketGateway.broadcastPriceUpdate({
        symbol,
        price: lastTrade.price,
        volume: totalVolume,
        timestamp: new Date(timestamp),
        tradeId: lastTrade.id,
      });

      // this.logger.debug(`Batch trade for ${symbol} processed successfully`);
    } catch (error) {
      this.logger.error(`Failed to process batch trade for ${symbol}:`, error);
      throw error;
    }
  }
}

@Processor('market-data-update')
@Injectable()
export class MarketDataProcessor {
  private readonly logger = new Logger(MarketDataProcessor.name);

  constructor(
    private marketGateway: MarketGateway,
    private orderService: OrderService
  ) {}

  @Process('update-market-data')
  async updateMarketData(
    job: Job<{ symbol: string; updateType: string; data: any }>
  ) {
    const { symbol, updateType, data } = job.data;

    try {
      // this.logger.debug(`Updating market data for ${symbol}: ${updateType}`);

      switch (updateType) {
        case 'price':
          this.marketGateway.broadcastPriceUpdate(data);
          break;
        case 'orderbook':
          this.marketGateway.broadcastMarketUpdate(data);
          break;
        case 'market':
          // 调用OrderService的broadcastMarketDataUpdate方法
          await this.orderService.broadcastMarketDataUpdate(symbol);
          break;
        default:
          this.logger.warn(`Unknown market data update type: ${updateType}`);
      }
    } catch (error) {
      this.logger.error(`Failed to update market data for ${symbol}:`, error);
      throw error;
    }
  }
}
