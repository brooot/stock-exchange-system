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
import { KlineService } from '../kline/kline.service';
import { OrderType, OrderStatus, OrderMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private positionService: PositionService,
    private marketGateway: MarketGateway,
    private klineService: KlineService
  ) {}

  /** 创建订单 */
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

    // 创建订单
    const order = await this.prisma.order.create({
      data: {
        userId,
        symbol,
        type,
        method,
        price: new Decimal(price),
        quantity,
        status: 'OPEN',
      },
    });

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

    if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
      throw new BadRequestException('订单状态不允许取消');
    }

    // 更新订单状态
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
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
    const trades: any[] = [];

    // 查找对手盘订单
    const whereCondition: any = {
      symbol, // 同一股票代码
      type: oppositeType,
      status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
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

    // 使用数据库事务执行撮合
    const result = await this.prisma.$transaction(async (prisma) => {
      // 执行撮合
      for (const oppositeOrder of oppositeOrders) {
        if (remainingQuantity <= 0) break;

        const availableQuantity =
          oppositeOrder.quantity - oppositeOrder.filledQuantity;
        if (availableQuantity <= 0) continue;

        // 简化的持仓检查逻辑：只检查卖方持仓
        let maxTradeQuantity = Math.min(remainingQuantity, availableQuantity);

        // 确定卖方用户ID和检查持仓
        const sellerId =
          newOrder.type === 'SELL' ? newOrder.userId : oppositeOrder.userId;
        const sellerPosition = await this.positionService.getUserPosition(
          sellerId,
          symbol
        );
        const availablePosition = sellerPosition ? sellerPosition.quantity : 0;
        maxTradeQuantity = Math.min(maxTradeQuantity, availablePosition);

        const tradeQuantity = maxTradeQuantity;

        // 如果没有可交易数量，跳过这个订单
        if (tradeQuantity <= 0) continue;

        // 优化的成交价格计算：使用对手盘价格（价格优先原则）
        let tradePrice: number;
        if (newOrder.method === OrderMethod.MARKET) {
          // 市价单直接使用对手盘价格成交
          tradePrice = oppositeOrder.price.toNumber();
        } else {
          // 限价单使用对手盘价格成交（遵循价格优先原则）
          tradePrice = oppositeOrder.price.toNumber();
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
                ? 'FILLED'
                : 'PARTIALLY_FILLED',
          },
        });

        // 更新对手订单
        await prisma.order.update({
          where: { id: oppositeOrder.id },
          data: {
            filledQuantity: oppositeOrderFilledQty,
            status:
              oppositeOrderFilledQty >= oppositeOrder.quantity
                ? 'FILLED'
                : 'PARTIALLY_FILLED',
          },
        });

        // 更新用户余额和持仓
        await this.updateUserBalances(
          newOrder.type === 'BUY' ? newOrder : oppositeOrder,
          newOrder.type === 'SELL' ? newOrder : oppositeOrder,
          tradePrice,
          tradeQuantity
        );

        filledQuantity += tradeQuantity;
        remainingQuantity -= tradeQuantity;
      }

      const finalStatus =
        filledQuantity >= newOrder.quantity
          ? 'FILLED'
          : filledQuantity > 0
          ? 'PARTIALLY_FILLED'
          : 'OPEN';

      return {
        filledQuantity,
        finalStatus,
        trades,
      };
    });

    // 事务完成后进行广播操作
    for (const tradeInfo of result.trades) {
      // 广播交易完成事件
      this.marketGateway.broadcastTradeCompleted({
        symbol: tradeInfo.symbol,
        price: tradeInfo.price,
        quantity: tradeInfo.quantity,
        timestamp: new Date(),
        tradeId: tradeInfo.trade.id,
      });

      // 触发K线数据更新
      await this.klineService.handlePriceUpdate({
        symbol: tradeInfo.symbol,
        price: tradeInfo.price,
        volume: tradeInfo.quantity,
        timestamp: new Date(),
        tradeId: tradeInfo.trade.id,
      });

      // 广播价格更新事件
      this.marketGateway.broadcastPriceUpdate({
        symbol: tradeInfo.symbol,
        price: tradeInfo.price,
        volume: tradeInfo.quantity,
        timestamp: new Date(),
        tradeId: tradeInfo.trade.id,
      });
    }

    // 如果有交易发生，广播市场数据更新
    if (result.filledQuantity > 0) {
      await this.broadcastMarketDataUpdate(symbol);
    }

    return {
      filledQuantity: result.filledQuantity,
      finalStatus: result.finalStatus,
    };
  }

  /** 更新用户持仓 */
  private async updateUserBalances(
    buyOrder: any,
    sellOrder: any,
    price: number,
    quantity: number
  ) {
    const tradeAmount = price * quantity;
    const symbol = buyOrder.symbol || sellOrder.symbol;

    // 使用事务确保原子性操作
    await this.prisma.$transaction(async (prisma) => {
      // 卖方：减少持仓，增加资金
      await this.positionService.updatePositionOnTrade(
        sellOrder.userId,
        symbol,
        'SELL',
        quantity,
        price
      );

      // 更新卖方资金
      const seller = await this.userService.findById(sellOrder.userId);
      await this.userService.updateBalance(
        sellOrder.userId,
        seller.balance.toNumber() + tradeAmount
      );

      // 买方：扣除资金，增加持仓
      const buyer = await this.userService.findById(buyOrder.userId);
      await this.userService.updateBalance(
        buyOrder.userId,
        buyer.balance.toNumber() - tradeAmount
      );
      await this.positionService.updatePositionOnTrade(
        buyOrder.userId,
        symbol,
        'BUY',
        quantity,
        price
      );
    });
  }

  /** 广播市场数据更新 */
  private async broadcastMarketDataUpdate(symbol: string) {
    // 获取最新成交价格（使用最后一次交易的价格）
    const latestTrade = await this.prisma.trade.findFirst({
      orderBy: { executedAt: 'desc' },
      select: { price: true },
    });

    const latestPrice = latestTrade ? latestTrade.price.toNumber() : 150.0;

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
