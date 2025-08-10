import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { PositionService } from '../position/position.service';
import { MarketGateway } from '../websocket/market.gateway';
import { QueueService, BatchTradeProcessingData } from '../queue/queue.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OrderType, OrderMethod, OrderStatus, Trade } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { SnowflakeService } from '../snowflake/snowflake.service';

@Injectable()
export class OrderService {
  // 缓存上一次的市场价格，避免重复广播相同价格
  private lastMarketPrices: Map<string, number> = new Map();

  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private positionService: PositionService,
    private marketGateway: MarketGateway,
    private queueService: QueueService,
    private snowflakeService: SnowflakeService,
    @InjectQueue('order-processing') private orderQueue: Queue,
    @InjectQueue('trade-processing') private tradeQueue: Queue
  ) {}

  /** 创建订单 - 异步处理版本 */
  async createOrder(
    userId: number,
    symbol: string,
    type: OrderType,
    method: OrderMethod,
    price: number,
    quantity: number
  ) {
    // 验证输入
    if (price <= 0 || quantity <= 0) {
      throw new BadRequestException('价格和数量必须大于0');
    }

    // 获取用户信息
    const user = await this.userService.findById(userId);

    // 检查资金/持仓
    if (type === OrderType.BUY) {
      const requiredAmount = price * quantity;
      if (user.balance.toNumber() < requiredAmount) {
        throw new BadRequestException('余额不足');
      }
    } else {
      // 检查持仓
      const hasEnoughPosition = await this.positionService.checkSellQuantity(
        userId,
        symbol,
        quantity
      );
      if (!hasEnoughPosition) {
        throw new BadRequestException('持仓不足');
      }
    }

    // 生成订单ID用于追踪
    const orderId = this.snowflakeService.generateId();

    // 添加到队列进行异步处理（不在这里创建订单）
    const priority = method === OrderMethod.MARKET ? 10 : 0; // 市价单优先级更高
    await this.orderQueue.add(
      'process-order',
      {
        userId,
        symbol,
        type,
        method,
        price,
        quantity,
        orderId,
        timestamp: Date.now(),
      },
      { priority }
    );

    return {
      id: orderId,
      status: 'PENDING', // 订单已提交，等待处理
      message: '订单已提交，正在处理中',
    };
  }

  /** 同步订单处理 - 用于队列处理器调用 */
  async createOrderSync(
    userId: number,
    symbol: string,
    type: OrderType,
    method: OrderMethod,
    price: number,
    quantity: number,
    orderId?: string
  ) {
    // 验证输入
    if (price <= 0 || quantity <= 0) {
      throw new BadRequestException('价格和数量必须大于0');
    }

    // 获取用户信息
    const user = await this.userService.findById(userId);

    // 检查资金/持仓
    if (type === OrderType.BUY) {
      const requiredAmount = price * quantity;
      if (user.balance.toNumber() < requiredAmount) {
        throw new BadRequestException('余额不足');
      }
    } else {
      // 检查持仓
      const hasEnoughPosition = await this.positionService.checkSellQuantity(
        userId,
        symbol,
        quantity
      );
      if (!hasEnoughPosition) {
        throw new BadRequestException('持仓不足');
      }
    }

    // 创建订单，处理ID冲突
    let order;
    let finalOrderId = orderId || this.snowflakeService.generateId();
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        order = await this.prisma.order.create({
          data: {
            id: finalOrderId,
            userId,
            symbol,
            type,
            method,
            price: new Decimal(price),
            quantity,
            status: OrderStatus.OPEN,
          },
        });
        break; // 成功创建，跳出循环
      } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('id')) {
          // ID冲突，生成新的ID重试
          finalOrderId = this.snowflakeService.generateId();
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error(
              `订单创建失败：ID冲突重试${maxRetries}次后仍然失败`
            );
          }
        } else {
          // 其他错误直接抛出
          throw error;
        }
      }
    }

    if (!order) {
      throw new Error('订单创建失败：未知错误');
    }

    // 尝试撮合
    const matchResult = await this.matchOrder(order);

    return {
      id: order.id,
      status: matchResult.finalStatus,
      filledQty: matchResult.filledQuantity,
    };
  }

  /** 取消订单 */
  async cancelOrder(orderId: string, userId: number) {
    // 查找订单
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('无权限取消此订单');
    }

    if (
      order.status !== OrderStatus.OPEN &&
      order.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      throw new BadRequestException('订单状态不允许取消');
    }

    // 更新订单状态
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    return { success: true };
  }

  // 优化的撮合引擎
  private async matchOrder(newOrder: any) {
    const oppositeType =
      newOrder.type === OrderType.BUY ? OrderType.SELL : OrderType.BUY;
    let filledQuantity = 0;
    let remainingQuantity = newOrder.quantity;
    const symbol = newOrder.symbol;
    interface TradeInfo {
      trade: Trade;
      price: number;
      quantity: number;
      symbol: string;
      buyOrderId?: string;
      sellOrderId?: string;
    }

    const trades: TradeInfo[] = [];

    // 查找对手盘订单
    const whereCondition: any = {
      symbol, // 同一股票代码
      type: oppositeType,
      status: { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
      userId: { not: newOrder.userId }, // 严格禁止自成交
    };

    // 市价单忽略价格限制，限价单需要价格匹配
    if (newOrder.method === OrderMethod.LIMIT) {
      if (newOrder.type === OrderType.BUY) {
        whereCondition.price = { lte: newOrder.price }; // 买单匹配价格小于等于的卖单
      } else {
        whereCondition.price = { gte: newOrder.price }; // 卖单匹配价格大于等于的买单
      }
    }

    const oppositeOrders = await this.prisma.order.findMany({
      where: whereCondition,
      orderBy: [
        { price: newOrder.type === OrderType.BUY ? 'asc' : 'desc' }, // 价格优先
        { createdAt: 'asc' }, // 时间优先
      ],
    });

    // 使用数据库事务执行撮合，包含重试机制
    const result = await this.executeWithRetry(async () => {
      return await this.prisma.$transaction(async (prisma) => {
        // 跟踪事务内的持仓变化
        const positionChanges = new Map<number, number>();

        // 执行撮合
        for (const oppositeOrder of oppositeOrders) {
          if (remainingQuantity <= 0) break;

          const availableQuantity =
            oppositeOrder.quantity - oppositeOrder.filledQuantity;
          if (availableQuantity <= 0) continue;

          // 改进的持仓检查逻辑：考虑事务内的持仓变化
          let maxTradeQuantity = Math.min(remainingQuantity, availableQuantity);

          // 确定卖方用户ID和检查持仓
          const sellerId =
            newOrder.type === 'SELL' ? newOrder.userId : oppositeOrder.userId;
          const sellerPosition = await this.positionService.getUserPosition(
            sellerId,
            symbol
          );
          let availablePosition = sellerPosition ? sellerPosition.quantity : 0;

          // 考虑事务内已经发生的持仓变化
          const positionChange = positionChanges.get(sellerId) || 0;
          availablePosition += positionChange;

          maxTradeQuantity = Math.min(maxTradeQuantity, availablePosition);

          const tradeQuantity = maxTradeQuantity;

          // 如果没有可交易数量，跳过这个订单
          if (tradeQuantity <= 0) continue;

          // 正确的成交价格计算：遵循价格优先和时间优先原则
          let tradePrice: number;
          if (newOrder.method === OrderMethod.MARKET) {
            // 市价单直接使用对手盘价格成交
            tradePrice = oppositeOrder.price.toNumber();
          } else {
            // 限价单撮合：使用对双方都有利的价格
            // 买单：使用较低价格（买方限价和卖方限价中的较低者）
            // 卖单：使用较高价格（买方限价和卖方限价中的较高者）
            const newOrderPrice = newOrder.price.toNumber();
            const oppositeOrderPrice = oppositeOrder.price.toNumber();

            if (newOrder.type === OrderType.BUY) {
              // 新订单是买单，使用较低价格（对买方有利）
              tradePrice = Math.min(newOrderPrice, oppositeOrderPrice);
            } else {
              // 新订单是卖单，使用较高价格（对卖方有利）
              tradePrice = Math.max(newOrderPrice, oppositeOrderPrice);
            }
          }
          tradePrice = Math.round(tradePrice * 100) / 100; // 保留2位小数

          // 创建交易记录
          const trade = await prisma.trade.create({
            data: {
              buyOrderId:
                newOrder.type === 'BUY' ? newOrder.id : oppositeOrder.id,
              sellOrderId:
                newOrder.type === 'SELL' ? newOrder.id : oppositeOrder.id,
              price: tradePrice,
              quantity: tradeQuantity,
            },
          });

          // 收集交易信息用于后续广播
          trades.push({
            trade,
            price: tradePrice,
            quantity: tradeQuantity,
            symbol,
          });

          // 更新订单状态
          const newOrderFilledQty = filledQuantity + tradeQuantity;
          const oppositeOrderFilledQty =
            oppositeOrder.filledQuantity + tradeQuantity;

          // 更新新订单
          await prisma.order.update({
            where: { id: newOrder.id },
            data: {
              filledQuantity: newOrderFilledQty,
              status:
                newOrderFilledQty >= newOrder.quantity
                  ? OrderStatus.FILLED
                  : OrderStatus.PARTIALLY_FILLED,
            },
          });

          // 更新对手订单
          await prisma.order.update({
            where: { id: oppositeOrder.id },
            data: {
              filledQuantity: oppositeOrderFilledQty,
              status:
                oppositeOrderFilledQty >= oppositeOrder.quantity
                  ? OrderStatus.FILLED
                  : OrderStatus.PARTIALLY_FILLED,
            },
          });

          // 更新用户余额和持仓（传入事务实例避免嵌套事务）
          await this.updateUserBalances(
            newOrder.type === 'BUY' ? newOrder : oppositeOrder,
            newOrder.type === 'SELL' ? newOrder : oppositeOrder,
            tradePrice,
            tradeQuantity,
            positionChanges,
            prisma // 传入当前事务实例
          );

          filledQuantity += tradeQuantity;
          remainingQuantity -= tradeQuantity;
        }

        const finalStatus =
          filledQuantity >= newOrder.quantity
            ? OrderStatus.FILLED
            : filledQuantity > 0
            ? OrderStatus.PARTIALLY_FILLED
            : OrderStatus.OPEN;

        return {
          filledQuantity,
          finalStatus,
          trades,
        };
      });
    });

    // 事务完成后批量处理交易广播
    if (result.trades.length > 0) {
      // 批量添加交易到处理队列，避免重复广播
      const batchTradeData: BatchTradeProcessingData = {
        trades: result.trades.map((tradeInfo) => ({
          id: tradeInfo.trade.id,
          buyOrderId: tradeInfo.trade.buyOrderId,
          sellOrderId: tradeInfo.trade.sellOrderId,
          price: tradeInfo.trade.price.toNumber(),
          quantity: tradeInfo.trade.quantity,
        })),
        symbol,
        totalVolume: result.filledQuantity,
        timestamp: Date.now(),
      };

      // 添加批量交易处理到队列
      await this.queueService.addBatchTradeProcessing(batchTradeData);

      // 添加市场数据更新到队列（一次撮合只需要一次市场数据更新）
      await this.queueService.addMarketDataUpdate(symbol, 'market', {
        symbol,
        price: result.trades[result.trades.length - 1]?.price || newOrder.price,
        volume: result.filledQuantity,
        timestamp: Date.now(),
      });
    }

    return {
      filledQuantity: result.filledQuantity,
      finalStatus: result.finalStatus,
    };
  }

  /** 更新用户持仓 - 在已有事务内执行，避免嵌套事务 */
  private async updateUserBalances(
    buyOrder: any,
    sellOrder: any,
    price: number,
    quantity: number,
    positionChanges?: Map<number, number>,
    prisma?: any // 传入事务实例
  ) {
    const tradeAmount = price * quantity;
    const symbol = buyOrder.symbol || sellOrder.symbol;
    const db = prisma || this.prisma; // 使用传入的事务实例或默认实例

    // 卖方：减少持仓，增加资金
    await this.updatePositionInTransaction(
      db,
      sellOrder.userId,
      symbol,
      OrderType.SELL,
      quantity,
      price
    );

    // 更新卖方资金
    const seller = await db.user.findUnique({
      where: { id: sellOrder.userId },
    });
    await db.user.update({
      where: { id: sellOrder.userId },
      data: { balance: seller.balance.toNumber() + tradeAmount },
    });

    // 买方：扣除资金，增加持仓
    const buyer = await db.user.findUnique({ where: { id: buyOrder.userId } });
    await db.user.update({
      where: { id: buyOrder.userId },
      data: { balance: buyer.balance.toNumber() - tradeAmount },
    });
    await this.updatePositionInTransaction(
      db,
      buyOrder.userId,
      symbol,
      OrderType.BUY,
      quantity,
      price
    );

    // 如果提供了持仓变化跟踪，更新它
    if (positionChanges) {
      const currentSellerChange = positionChanges.get(sellOrder.userId) || 0;
      const currentBuyerChange = positionChanges.get(buyOrder.userId) || 0;
      positionChanges.set(sellOrder.userId, currentSellerChange - quantity);
      positionChanges.set(buyOrder.userId, currentBuyerChange + quantity);
    }
  }

  /** 广播市场数据更新 */
  async broadcastMarketDataUpdate(symbol: string) {
    // 获取最新成交价格（使用最后一次交易的价格）
    const latestTrade = await this.prisma.trade.findFirst({
      orderBy: { executedAt: 'desc' },
      select: { price: true },
    });

    const latestPrice = latestTrade ? latestTrade.price.toNumber() : 150.0;

    // 检查价格是否与上次相同，如果相同则跳过广播
    const lastPrice = this.lastMarketPrices.get(symbol);
    if (lastPrice !== undefined && lastPrice === latestPrice) {
      // 价格未变化，跳过广播
      return;
    }

    // 更新缓存的价格
    this.lastMarketPrices.set(symbol, latestPrice);

    // 计算今日开盘价（简化实现，使用当日第一笔交易价格）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const firstTradeToday = await this.prisma.trade.findFirst({
      where: {
        executedAt: { gte: todayStart },
      },
      orderBy: { executedAt: 'asc' },
      select: { price: true },
    });

    const openPrice = firstTradeToday
      ? firstTradeToday.price.toNumber()
      : latestPrice;
    const change = latestPrice - openPrice;
    const changePercent = openPrice > 0 ? change / openPrice : 0;

    // 获取今日最高最低价
    const todayPriceStats = await this.prisma.trade.aggregate({
      where: {
        executedAt: { gte: todayStart },
      },
      _max: { price: true },
      _min: { price: true },
      _sum: { quantity: true },
    });

    const marketData = {
      symbol,
      price: latestPrice,
      change: change,
      changePercent: changePercent,
      open: openPrice,
      high: todayPriceStats._max.price
        ? todayPriceStats._max.price.toNumber()
        : latestPrice,
      low: todayPriceStats._min.price
        ? todayPriceStats._min.price.toNumber()
        : latestPrice,
      volume: todayPriceStats._sum.quantity || 0,
      timestamp: new Date(),
    };
    this.marketGateway.broadcastMarketUpdate(marketData);
  }

  /** 事务重试机制 */
  private async executeWithRetry(
    operation: () => Promise<any>,
    maxRetries = 3
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries || !this.isRetryableError(error)) {
          throw error;
        }
        // 指数退避
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }

  private isRetryableError(error: any): boolean {
    return (
      error.code === 'P2034' || // Transaction conflict
      error.code === 'P2002' || // Unique constraint violation
      (error.message && error.message.includes('deadlock'))
    );
  }

  /** 在事务内更新持仓 - 避免嵌套事务 */
  private async updatePositionInTransaction(
    db: any,
    userId: number,
    symbol: string,
    orderType: OrderType,
    quantity: number,
    price: number
  ) {
    const existingPosition = await db.position.findUnique({
      where: {
        userId_symbol: {
          userId,
          symbol,
        },
      },
    });

    if (orderType === OrderType.BUY) {
      if (existingPosition) {
        // 计算新的平均成本价
        const totalCost =
          existingPosition.quantity *
            parseFloat(existingPosition.avgPrice.toString()) +
          quantity * price;
        const totalQuantity = existingPosition.quantity + quantity;
        const newAvgPrice = totalCost / totalQuantity;

        return db.position.update({
          where: {
            userId_symbol: {
              userId,
              symbol,
            },
          },
          data: {
            quantity: totalQuantity,
            avgPrice: newAvgPrice,
          },
        });
      } else {
        // 创建新持仓
        return db.position.create({
          data: {
            userId,
            symbol,
            quantity,
            avgPrice: price,
          },
        });
      }
    } else {
      // SELL 订单
      if (existingPosition) {
        const actualSellQuantity = Math.min(
          quantity,
          existingPosition.quantity
        );
        const newQuantity = existingPosition.quantity - actualSellQuantity;

        if (newQuantity > 0) {
          // 更新持仓数量，保持平均成本价不变
          return db.position.update({
            where: {
              userId_symbol: {
                userId,
                symbol,
              },
            },
            data: {
              quantity: newQuantity,
            },
          });
        } else {
          // 清空持仓
          return db.position.delete({
            where: {
              userId_symbol: {
                userId,
                symbol,
              },
            },
          });
        }
      }
    }
  }

  /** 获取用户的订单列表 */
  async getUserOrders(userId: number) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        symbol: true,
        type: true,
        price: true,
        quantity: true,
        filledQuantity: true,
        status: true,
        createdAt: true,
      },
    });

    return orders.map((order) => ({
      ...order,
      price: order.price.toNumber(),
    }));
  }
}
