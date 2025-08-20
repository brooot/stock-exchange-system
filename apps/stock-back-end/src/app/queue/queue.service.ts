import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OrderType, OrderMethod, Trade } from '@prisma/client';

export interface OrderQueueData {
  userId: number;
  symbol: string;
  type: OrderType;
  method: OrderMethod;
  price: number;
  quantity: number;
  orderId: string;
  timestamp: number;
}

// BatchTradeProcessingData 使用 Prisma 的 Trade 类型简化，确保与数据库模型一致
export interface BatchTradeProcessingData {
  trades: (Omit<
    Pick<Trade, 'id' | 'buyOrderId' | 'sellOrderId' | 'price' | 'quantity'>,
    'price'
  > & { price: number })[];
  symbol: string;
  totalVolume: number;
  timestamp: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer: NodeJS.Timeout;

  onModuleInit() {
    // 每30分钟自动清理队列
    this.cleanupTimer = setInterval(() => {
      this.cleanQueues();
    }, 10 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
  constructor(
    @InjectQueue('order-processing') private orderQueue: Queue,
    @InjectQueue('trade-processing') private tradeQueue: Queue,
    @InjectQueue('market-data-update') private marketDataQueue: Queue
  ) {}

  // 添加订单到处理队列
  async addOrderToQueue(
    orderData: OrderQueueData,
    priority = 0
  ): Promise<void> {
    await this.orderQueue.add('process-order', orderData, {
      priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 5,
      removeOnFail: 10,
    });
  }

  // 添加高优先级订单（市价单）
  async addHighPriorityOrder(orderData: OrderQueueData): Promise<void> {
    await this.addOrderToQueue(orderData, 10);
  }

  // 批量添加交易处理到队列
  async addBatchTradeProcessing(
    batchTradeData: BatchTradeProcessingData
  ): Promise<void> {
    await this.tradeQueue.add('process-batch-trade', batchTradeData, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 5,
      removeOnFail: 10,
    });
  }

  // 添加市场数据更新到队列
  async addMarketDataUpdate(
    symbol: string,
    updateType: string,
    data: any
  ): Promise<void> {
    await this.marketDataQueue.add(
      'update-market-data',
      {
        symbol,
        updateType,
        data,
        timestamp: Date.now(),
      },
      {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 500,
        },
        removeOnComplete: 5,
        removeOnFail: 10,
      }
    );
  }

  // 获取队列状态
  async getQueueStats() {
    const [orderStats, tradeStats, marketDataStats] = await Promise.all([
      this.getQueueInfo(this.orderQueue),
      this.getQueueInfo(this.tradeQueue),
      this.getQueueInfo(this.marketDataQueue),
    ]);

    return {
      orderProcessing: orderStats,
      tradeProcessing: tradeStats,
      marketDataUpdate: marketDataStats,
    };
  }

  private async getQueueInfo(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  // 清理队列
  async cleanQueues(): Promise<void> {
    await Promise.all([
      this.orderQueue.clean(1 * 60 * 60 * 1000, 'completed'),
      this.orderQueue.clean(1 * 60 * 60 * 1000, 'failed'),
      this.tradeQueue.clean(1 * 60 * 60 * 1000, 'completed'),
      this.tradeQueue.clean(1 * 60 * 60 * 1000, 'failed'),
      this.marketDataQueue.clean(30 * 60 * 1000, 'completed'),
      this.marketDataQueue.clean(30 * 60 * 1000, 'failed'),
    ]);
  }

  // 暂停队列
  async pauseQueues(): Promise<void> {
    await Promise.all([
      this.orderQueue.pause(),
      this.tradeQueue.pause(),
      this.marketDataQueue.pause(),
    ]);
  }

  // 恢复队列
  async resumeQueues(): Promise<void> {
    await Promise.all([
      this.orderQueue.resume(),
      this.tradeQueue.resume(),
      this.marketDataQueue.resume(),
    ]);
  }
}
