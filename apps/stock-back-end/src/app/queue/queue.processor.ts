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

  // 防止重复处理的缓存
  private processedBatches = new Set<string>();
  private cleanupTimer: NodeJS.Timeout;

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  private cleanupCache() {
    // 清理缓存，保留最近1000个记录
    if (this.processedBatches.size > 1000) {
      const entries = Array.from(this.processedBatches);
      this.processedBatches.clear();
      // 保留最新的500个
      entries.slice(-500).forEach((entry) => this.processedBatches.add(entry));
      this.logger.debug('清理了交易批次缓存');
    }
  }

  constructor(
    private marketGateway: MarketGateway,
    private klineService: KlineService
  ) {
    // 每10分钟清理一次缓存，防止内存泄漏
    this.cleanupTimer = setInterval(() => {
      this.cleanupCache();
    }, 10 * 60 * 1000);
  }

  @Process('process-batch-trade')
  async processBatchTrade(job: Job<BatchTradeProcessingData>) {
    const { trades, symbol, totalVolume, timestamp } = job.data;

    try {
      // 生成批次唯一标识符，避免重复处理
      const batchId = `${symbol}_${timestamp}_${trades.length}_${totalVolume}`;

      if (this.processedBatches.has(batchId)) {
        // this.logger.debug(`Batch ${batchId} already processed, skipping`);
        return;
      }

      // 标记为已处理
      this.processedBatches.add(batchId);

      // 清理过期的批次记录（保留最近1小时）
      if (this.processedBatches.size > 1000) {
        const batchArray = Array.from(this.processedBatches);
        const toKeep = batchArray.slice(-500); // 保留最新的500个
        this.processedBatches.clear();
        toKeep.forEach((id) => this.processedBatches.add(id));
      }

      // this.logger.debug(
      //   `Processing batch trade for ${symbol} with ${trades.length} trades`
      // );

      // 计算加权平均价格
      const totalValue = trades.reduce(
        (sum, trade) => sum + trade.price * trade.quantity,
        0
      );
      const avgPrice = totalValue / totalVolume;
      const lastTrade = trades[trades.length - 1];

      // 统一处理：先更新K线数据，再广播事件
      await this.klineService.handlePriceUpdate({
        symbol,
        price: lastTrade.price,
        volume: totalVolume,
        timestamp: new Date(timestamp),
        tradeId: lastTrade.id,
      });

      // 广播批量交易完成事件（只广播一次汇总信息）
      this.marketGateway.broadcastTradeCompleted({
        symbol,
        price: avgPrice,
        quantity: totalVolume,
        timestamp: new Date(timestamp),
        tradeId: trades[0].id, // 使用第一个交易的ID作为代表
        batchSize: trades.length,
      });

      // 广播价格更新事件（使用最后一个交易的价格）
      this.marketGateway.broadcastPriceUpdate({
        symbol,
        price: lastTrade.price,
        volume: totalVolume,
        timestamp: new Date(timestamp),
        tradeId: lastTrade.id,
      });

      this.logger.debug(`Batch trade for ${symbol} processed successfully`);
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

  // 防止重复处理的缓存
  private processedUpdates = new Map<string, number>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private marketGateway: MarketGateway,
    private orderService: OrderService
  ) {
    // 每5分钟清理一次缓存，防止内存泄漏
    this.cleanupTimer = setInterval(() => {
      this.cleanupCache();
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  private cleanupCache() {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // 清理5分钟前的缓存记录
    for (const [key, timestamp] of this.processedUpdates.entries()) {
      if (timestamp < fiveMinutesAgo) {
        this.processedUpdates.delete(key);
      }
    }

    this.logger.debug(
      `清理了市场数据更新缓存，当前大小: ${this.processedUpdates.size}`
    );
  }

  @Process('update-market-data')
  async updateMarketData(
    job: Job<{ symbol: string; updateType: string; data: any }>
  ) {
    const { symbol, updateType, data } = job.data;

    try {
      // 生成更新唯一标识符，避免重复处理
      const updateKey = `${symbol}_${updateType}`;
      const currentTime = Date.now();

      // 检查是否在短时间内已经处理过相同的更新
      const lastProcessed = this.processedUpdates.get(updateKey);
      if (lastProcessed && currentTime - lastProcessed < 50) {
        // 50ms 内的重复更新忽略
        // this.logger.debug(`Market data update ${updateKey} already processed recently, skipping`);
        return;
      }

      // 记录处理时间
      this.processedUpdates.set(updateKey, currentTime);

      // 清理过期的记录（保留最近5分钟）
      const fiveMinutesAgo = currentTime - 5 * 60 * 1000;
      for (const [key, timestamp] of this.processedUpdates.entries()) {
        if (timestamp < fiveMinutesAgo) {
          this.processedUpdates.delete(key);
        }
      }

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
