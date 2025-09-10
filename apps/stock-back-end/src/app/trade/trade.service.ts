import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TradeService {
  constructor(private prisma: PrismaService) {}

  // 获取所有交易记录
  async getAllTrades() {
    return this.prisma.trade.findMany({
      orderBy: { executedAt: 'desc' },
      include: {
        buyOrder: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        sellOrder: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });
  }

  // 根据用户获取交易记录
  async getTradesByUser(userId: number) {
    return this.prisma.trade.findMany({
      where: {
        OR: [{ buyOrder: { userId } }, { sellOrder: { userId } }],
      },
      orderBy: { executedAt: 'desc' },
      include: {
        buyOrder: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        sellOrder: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });
  }

  // 根据ID获取交易记录
  async getTradeById(id: number) {
    return this.prisma.trade.findUnique({
      where: { id },
      include: {
        buyOrder: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        sellOrder: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
      },
    });
  }

  // 获取当前市场价格
  async getCurrentMarketPrice(): Promise<number> {
    // 获取最近的交易价格
    const latestTrade = await this.prisma.trade.findFirst({
      orderBy: { executedAt: 'desc' },
      select: { price: true },
    });

    if (latestTrade && latestTrade.price !== null) {
      return latestTrade.price.toNumber();
    }

    // 如果没有交易记录，获取最近的订单价格
    const latestOrder = await this.prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { price: true },
    });

    return latestOrder && latestOrder.price !== null
      ? latestOrder.price.toNumber()
      : 150.0; // 默认价格
  }

  // 获取市场数据
  async getMarketData() {
    // 获取最近的交易记录来计算市场数据
    const recentTrades = await this.prisma.trade.findMany({
      orderBy: { executedAt: 'desc' },
      take: 100, // 取最近100条交易记录
    });
    if (recentTrades.length === 0) {
      // 如果没有交易记录，返回默认数据
      return {
        symbol: 'AAPL',
        price: 150.0,
        change: 0,
        changePercent: 0,
        volume: 0,
        high: 150.0,
        low: 150.0,
        open: 150.0,
      };
    }

    // 计算市场数据，过滤掉价格为 null 的交易记录
    const validTrades = recentTrades.filter((trade) => trade.price !== null);
    if (validTrades.length === 0) {
      // 如果没有有效的交易记录，返回默认数据
      return {
        symbol: 'AAPL',
        price: 150.0,
        change: 0,
        changePercent: 0,
        volume: 0,
        high: 150.0,
        low: 150.0,
        open: 150.0,
      };
    }

    const prices = validTrades.map((trade) =>
      parseFloat(trade.price.toString())
    );
    const currentPrice = prices[0]; // 最新价格
    const volumes = validTrades.map((trade) => trade.quantity);
    const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);

    // 计算今日开盘价（假设为24小时前的价格，如果没有则使用当前价格）
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayStartTrades = validTrades.filter(
      (trade) => new Date(trade.executedAt) >= oneDayAgo
    );
    const openPrice =
      dayStartTrades.length > 0
        ? parseFloat(dayStartTrades[dayStartTrades.length - 1].price.toString())
        : currentPrice;

    // 计算涨跌
    const change = currentPrice - openPrice;
    const changePercent = openPrice !== 0 ? change / openPrice : 0;

    // 计算最高价和最低价
    const high = Math.max(...prices);
    const low = Math.min(...prices);

    return {
      symbol: 'AAPL',
      price: currentPrice,
      change: change,
      changePercent: changePercent,
      volume: totalVolume,
      high: high,
      low: low,
      open: openPrice,
    };
  }
}
