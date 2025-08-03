import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { OrderService } from '../order/order.service';
import { MarketGateway } from '../websocket/market.gateway';
import { KlineService } from '../kline/kline.service';
import { OrderQueueData, TradeProcessingData } from './queue.service';

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

      // 处理订单撮合
      const result = await this.orderService.createOrderSync(
        userId,
        symbol,
        type,
        method,
        price,
        quantity
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

  @Process('process-trade')
  async processTrade(job: Job<TradeProcessingData>) {
    const { tradeId, buyOrderId, sellOrderId, price, quantity, symbol } =
      job.data;

    try {
      this.logger.debug(`Processing trade ${tradeId}`);

      // 广播交易完成事件
      this.marketGateway.broadcastTradeCompleted({
        symbol,
        price,
        quantity,
        timestamp: new Date(),
        tradeId,
      });

      // 触发K线数据更新
      await this.klineService.handlePriceUpdate({
        symbol,
        price,
        volume: quantity,
        timestamp: new Date(),
        tradeId,
      });

      // 广播价格更新事件
      this.marketGateway.broadcastPriceUpdate({
        symbol,
        price,
        volume: quantity,
        timestamp: new Date(),
        tradeId,
      });

      this.logger.debug(`Trade ${tradeId} processed successfully`);
    } catch (error) {
      this.logger.error(`Failed to process trade ${tradeId}:`, error);
      throw error;
    }
  }
}

@Processor('market-data-update')
@Injectable()
export class MarketDataProcessor {
  private readonly logger = new Logger(MarketDataProcessor.name);

  constructor(private marketGateway: MarketGateway) {}

  @Process('update-market-data')
  async updateMarketData(
    job: Job<{ symbol: string; updateType: string; data: any }>
  ) {
    const { symbol, updateType, data } = job.data;

    try {
      this.logger.debug(`Updating market data for ${symbol}: ${updateType}`);

      switch (updateType) {
        case 'price':
          this.marketGateway.broadcastPriceUpdate(data);
          break;
        case 'orderbook':
          this.marketGateway.broadcastMarketUpdate(data);
          break;
        case 'market':
          this.marketGateway.broadcastMarketUpdate(data);
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
