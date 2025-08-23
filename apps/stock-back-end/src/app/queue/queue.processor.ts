import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { OrderService } from '../order/order.service';
import { MarketGateway } from '../websocket/market.gateway';
import { KlineService } from '../kline/kline.service';
import { OrderQueueData, BatchTradeProcessingData, QueueService } from './queue.service';

@Processor('order-processing')
@Injectable()
export class OrderProcessor {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(private orderService: OrderService) {}

  @Process({ name: 'process-order', concurrency: 1 })
  async processOrder(job: Job<OrderQueueData>) {
    const { userId, symbol, type, method, price, quantity, orderId } = job.data;

    try {
      // this.logger.debug(`Processing order ${orderId} for user ${userId}`);

      // 处理订单撮合（传递orderId确保使用相同的订单ID）
      const result = await this.orderService.handleOrderSync(
        orderId,
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
    private klineService: KlineService,
    private queueService: QueueService
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

      // 改为入队价格更新事件（使用最后一个交易的价格）
      await this.queueService.addMarketDataUpdate(
        symbol,
        'price',
        {
          symbol,
          price: lastTrade.price,
          volume: totalVolume,
          timestamp: new Date(timestamp),
          tradeId: lastTrade.id,
        }
      );

      // 追加一条市场汇总更新任务（由服务端查询聚合后广播）
      await this.queueService.addMarketDataUpdate(symbol, 'market', {});

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
  // 新增：尾沿合并（trailing debounce）所需的定时器与最后一次载荷
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private lastPayloads = new Map<string, { symbol: string; updateType: 'price' | 'market'; data: any }>();
  // 新增：最大等待时间（maxWait）定时器，防止持续高频事件导致一直不触发广播
  private maxWaitTimers = new Map<string, NodeJS.Timeout>();

  private static readonly UPDATE_DEBOUNCE_MS = 50;
  // 新增：最大等待时间上限（方案A）
  private static readonly MAX_WAIT_MS = 500;

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
    // 清理所有定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    // 清理maxWait定时器
    for (const timer of this.maxWaitTimers.values()) {
      clearTimeout(timer);
    }
    this.maxWaitTimers.clear();
    this.lastPayloads.clear();
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
    job: Job<{ symbol: string; updateType: 'price' | 'market'; data: any }>
  ) {
    const { symbol, updateType, data } = job.data;

    try {
      // 生成更新唯一标识符（按 symbol + updateType）
      const updateKey = `${symbol}_${updateType}`;
      const currentTime = Date.now();

      // 记录处理时间（用于监控）
      this.processedUpdates.set(updateKey, currentTime);

      // 尾沿合并：记录最后一次载荷，并在窗口结束时发射
      this.lastPayloads.set(updateKey, { symbol, updateType, data });

      const existingTimer = this.debounceTimers.get(updateKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 短窗口尾沿防抖计时器
      const timer = setTimeout(async () => {
        try {
          const payload = this.lastPayloads.get(updateKey);
          if (!payload) return;

          switch (payload.updateType) {
            case 'price':
              this.marketGateway.broadcastPriceUpdate(payload.data);
              break;
            case 'market':
              // 调用OrderService的broadcastMarketDataUpdate方法
              await this.orderService.broadcastMarketDataUpdate(payload.symbol);
              break;
            default:
              // 不会到达：联合类型已限制
              break;
          }
        } catch (err) {
          this.logger.error(`Debounced emit failed for ${updateKey}:`, err);
        } finally {
          // 触发一次广播后，清理两个计时器与缓存
          const maxWaitTimer = this.maxWaitTimers.get(updateKey);
          if (maxWaitTimer) {
            clearTimeout(maxWaitTimer);
            this.maxWaitTimers.delete(updateKey);
          }
          this.debounceTimers.delete(updateKey);
          this.lastPayloads.delete(updateKey);
        }
      }, MarketDataProcessor.UPDATE_DEBOUNCE_MS);

      this.debounceTimers.set(updateKey, timer);

      // 最大等待时间计时器（只在未启动时设置，避免被持续事件不断推迟）
      if (!this.maxWaitTimers.get(updateKey)) {
        const maxTimer = setTimeout(async () => {
          try {
            const payload = this.lastPayloads.get(updateKey);
            if (!payload) return;

            switch (payload.updateType) {
              case 'price':
                this.marketGateway.broadcastPriceUpdate(payload.data);
                break;
              case 'market':
                await this.orderService.broadcastMarketDataUpdate(payload.symbol);
                break;
              default:
                break;
            }
          } catch (err) {
            this.logger.error(`MaxWait emit failed for ${updateKey}:`, err);
          } finally {
            // 强制触发后，同样清理短窗口计时器与缓存，防止重复触发
            const debounce = this.debounceTimers.get(updateKey);
            if (debounce) {
              clearTimeout(debounce);
              this.debounceTimers.delete(updateKey);
            }
            this.maxWaitTimers.delete(updateKey);
            this.lastPayloads.delete(updateKey);
          }
        }, MarketDataProcessor.MAX_WAIT_MS);

        this.maxWaitTimers.set(updateKey, maxTimer);
      }
    } catch (error) {
      this.logger.error(`Failed to update market data for ${symbol}:`, error);
      throw error;
    }
  }
}
