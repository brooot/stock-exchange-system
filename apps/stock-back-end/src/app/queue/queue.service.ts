import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OrderType, OrderMethod } from '@prisma/client';

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

export interface TradeProcessingData {
  tradeId: number;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  symbol: string;
  timestamp: number;
}

@Injectable()
export class QueueService {
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
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  // 添加高优先级订单（市价单）
  async addHighPriorityOrder(orderData: OrderQueueData): Promise<void> {
    await this.addOrderToQueue(orderData, 10);
  }

  // 添加交易处理到队列
  async addTradeProcessing(tradeData: TradeProcessingData): Promise<void> {
    await this.tradeQueue.add('process-trade', tradeData, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 200,
      removeOnFail: 100,
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
        removeOnComplete: 50,
        removeOnFail: 25,
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
      this.orderQueue.clean(24 * 60 * 60 * 1000, 'completed'),
      this.orderQueue.clean(24 * 60 * 60 * 1000, 'failed'),
      this.tradeQueue.clean(24 * 60 * 60 * 1000, 'completed'),
      this.tradeQueue.clean(24 * 60 * 60 * 1000, 'failed'),
      this.marketDataQueue.clean(6 * 60 * 60 * 1000, 'completed'),
      this.marketDataQueue.clean(6 * 60 * 60 * 1000, 'failed'),
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
